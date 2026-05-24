package main

import (
	"encoding/json"
	"fmt"
	"os"
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

func (cm *ConfigManager) Delete(id string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

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
