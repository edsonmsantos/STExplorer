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
