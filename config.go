package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type ServerConfig struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	User           string `json:"user"`
	Password       string `json:"password,omitempty"`
	PrivateKeyPath string `json:"privateKeyPath,omitempty"`
	Passphrase     string `json:"passphrase,omitempty"`
	// HighThroughput enables 256 KB SFTP packets and a wider concurrency
	// window. Default is true (most modern SSH servers support it). When a
	// connection-lost error occurs during a transfer we flip it to false
	// automatically so retries use the spec-safe 32 KB packets.
	// Pointer so legacy JSON entries without the field can be detected and
	// defaulted to true.
	HighThroughput *bool  `json:"highThroughput,omitempty"`
	Source         string `json:"source,omitempty"` // "ssh-config", "putty", etc.
}

// UseHighThroughput reports the effective value — defaulting to false (safe mode)
// when the field is absent. This ensures broad compatibility with standard
// OpenSSH and restricted SFTP servers without dropped connections.
func (c *ServerConfig) UseHighThroughput() bool {
	if c.HighThroughput == nil {
		return false
	}
	return *c.HighThroughput
}

type ConfigManager struct {
	FilePath string
	mu       sync.Mutex
}

func NewConfigManager(path string) *ConfigManager {
	return &ConfigManager{FilePath: path}
}

func (cm *ConfigManager) LoadConfigs() ([]ServerConfig, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	return cm.loadLocked()
}

func (cm *ConfigManager) loadLocked() ([]ServerConfig, error) {
	if _, err := os.Stat(cm.FilePath); os.IsNotExist(err) {
		return []ServerConfig{}, nil
	}

	data, err := os.ReadFile(cm.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var configs []ServerConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config data: %w", err)
	}

	// Auto-migrate legacy plaintext secrets to encrypted form. Done once,
	// silently — saves the file back so the plaintext is replaced ASAP.
	migrated := false
	for i := range configs {
		if configs[i].Password != "" && !isEncrypted(configs[i].Password) {
			if enc, err := EncryptSecret(configs[i].Password); err == nil {
				configs[i].Password = enc
				migrated = true
			}
		}
		if configs[i].Passphrase != "" && !isEncrypted(configs[i].Passphrase) {
			if enc, err := EncryptSecret(configs[i].Passphrase); err == nil {
				configs[i].Passphrase = enc
				migrated = true
			}
		}
	}
	if migrated {
		_ = cm.saveLocked(configs)
	}

	return configs, nil
}

func (cm *ConfigManager) SaveConfigs(configs []ServerConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	return cm.saveLocked(configs)
}

func (cm *ConfigManager) saveLocked(configs []ServerConfig) error {
	data, err := json.MarshalIndent(configs, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config data: %w", err)
	}

	if err := os.WriteFile(cm.FilePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// Upsert inserts or replaces a server by ID. If ID is empty a new one is assigned.
// Sensitive fields are encrypted before storage. Empty Password/Passphrase on
// an existing record means "keep the current secret" (the UI hides stored
// secrets, so a blank field should never wipe what we already have).
// Returns the stored config (with ID populated).
func (cm *ConfigManager) Upsert(s ServerConfig) (ServerConfig, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	configs, err := cm.loadLocked()
	if err != nil {
		return ServerConfig{}, err
	}

	if s.ID == "" {
		s.ID = nextID(configs)
	}

	// Find existing record (if any) so we can preserve secrets the form
	// didn't include.
	var existing *ServerConfig
	for i := range configs {
		if configs[i].ID == s.ID {
			existing = &configs[i]
			break
		}
	}

	if s.Password == "" && existing != nil {
		s.Password = existing.Password // already encrypted
	} else if s.Password != "" {
		enc, err := EncryptSecret(s.Password)
		if err != nil {
			return ServerConfig{}, fmt.Errorf("failed to encrypt password: %w", err)
		}
		s.Password = enc
	}

	if s.Passphrase == "" && existing != nil {
		s.Passphrase = existing.Passphrase
	} else if s.Passphrase != "" {
		enc, err := EncryptSecret(s.Passphrase)
		if err != nil {
			return ServerConfig{}, fmt.Errorf("failed to encrypt passphrase: %w", err)
		}
		s.Passphrase = enc
	}

	replaced := false
	for i := range configs {
		if configs[i].ID == s.ID {
			configs[i] = s
			replaced = true
			break
		}
	}
	if !replaced {
		configs = append(configs, s)
	}

	if err := cm.saveLocked(configs); err != nil {
		return ServerConfig{}, err
	}
	return s, nil
}

// SetHighThroughput updates the flag for a single server, persisting
// without touching any other field (in particular, encrypted secrets are
// preserved as-is).
func (cm *ConfigManager) SetHighThroughput(id string, enabled bool) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	configs, err := cm.loadLocked()
	if err != nil {
		return err
	}
	for i := range configs {
		if configs[i].ID == id {
			configs[i].HighThroughput = &enabled
			return cm.saveLocked(configs)
		}
	}

	// If it's a detected server not yet saved in servers.json, persist it
	detected := DetectOSServers()
	for _, d := range detected {
		if d.ID == id {
			d.HighThroughput = &enabled
			d.Source = ""
			configs = append(configs, d)
			return cm.saveLocked(configs)
		}
	}

	return nil
}

func (cm *ConfigManager) ignoredFilePath() string {
	dir := filepath.Dir(cm.FilePath)
	return filepath.Join(dir, "ignored_servers.json")
}

func (cm *ConfigManager) loadIgnoredLocked() map[string]bool {
	ignored := make(map[string]bool)
	data, err := os.ReadFile(cm.ignoredFilePath())
	if err != nil {
		return ignored
	}
	var list []string
	if err := json.Unmarshal(data, &list); err == nil {
		for _, item := range list {
			ignored[item] = true
		}
	}
	return ignored
}

func (cm *ConfigManager) saveIgnoredLocked(ignored map[string]bool) error {
	list := make([]string, 0, len(ignored))
	for k := range ignored {
		list = append(list, k)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cm.ignoredFilePath(), data, 0600)
}

// GetAllServers returns saved servers merged with OS-detected servers
// (~/.ssh/config, PuTTY) that haven't been dismissed or overridden.
func (cm *ConfigManager) GetAllServers() ([]ServerConfig, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	saved, err := cm.loadLocked()
	if err != nil {
		return nil, err
	}

	ignored := cm.loadIgnoredLocked()

	seenIDs := make(map[string]bool)
	seenKeys := make(map[string]bool)
	for _, s := range saved {
		seenIDs[s.ID] = true
		key := fmt.Sprintf("%s:%d@%s", strings.ToLower(s.User), s.Port, strings.ToLower(s.Host))
		seenKeys[key] = true
	}

	detected := DetectOSServers()
	result := make([]ServerConfig, 0, len(saved)+len(detected))
	result = append(result, saved...)

	for _, d := range detected {
		if ignored[d.ID] || ignored[d.Name] {
			continue
		}
		if seenIDs[d.ID] {
			continue
		}
		key := fmt.Sprintf("%s:%d@%s", strings.ToLower(d.User), d.Port, strings.ToLower(d.Host))
		if seenKeys[key] {
			continue
		}
		seenKeys[key] = true
		result = append(result, d)
	}

	return result, nil
}

func (cm *ConfigManager) FindServer(id string) (*ServerConfig, error) {
	all, err := cm.GetAllServers()
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].ID == id {
			return &all[i], nil
		}
	}
	return nil, fmt.Errorf("server not found: %s", id)
}

func (cm *ConfigManager) Delete(id string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if strings.HasPrefix(id, "ssh-config:") || strings.HasPrefix(id, "putty:") {
		ignored := cm.loadIgnoredLocked()
		ignored[id] = true
		_ = cm.saveIgnoredLocked(ignored)
	}

	configs, err := cm.loadLocked()
	if err != nil {
		return err
	}

	out := configs[:0]
	for _, c := range configs {
		if c.ID != id {
			out = append(out, c)
		}
	}
	return cm.saveLocked(out)
}

func nextID(configs []ServerConfig) string {
	max := 0
	for _, c := range configs {
		var n int
		fmt.Sscanf(c.ID, "%d", &n)
		if n > max {
			max = n
		}
	}
	return fmt.Sprintf("%d", max+1)
}
