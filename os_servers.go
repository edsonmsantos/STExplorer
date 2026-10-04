package main

import (
	"bufio"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// DetectOSServers scans OS-level configurations for SSH/SFTP servers.
// Currently supports:
//  1. OpenSSH config (~/.ssh/config on Linux/macOS/Windows)
//  2. PuTTY sessions (~/.putty/sessions on Linux)
func DetectOSServers() []ServerConfig {
	var detected []ServerConfig

	// 1. OpenSSH config (~/.ssh/config)
	if sshServers, err := parseOpenSSHConfig(); err == nil {
		detected = append(detected, sshServers...)
	}

	// 2. PuTTY sessions (Linux: ~/.putty/sessions)
	if puttyServers, err := parsePuttySessionsLinux(); err == nil {
		detected = append(detected, puttyServers...)
	}

	return detected
}

func parseOpenSSHConfig() ([]ServerConfig, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	configPath := filepath.Join(home, ".ssh", "config")
	f, err := os.Open(configPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	return parseOpenSSHConfigReader(f, home)
}

type sshHostBlock struct {
	aliases      []string
	hostName     string
	port         int
	user         string
	identityFile string
}

func parseOpenSSHConfigReader(r io.Reader, homeDir string) ([]ServerConfig, error) {
	var servers []ServerConfig
	scanner := bufio.NewScanner(r)

	var cur *sshHostBlock

	saveCurrent := func() {
		if cur == nil {
			return
		}
		// Find the primary alias (first non-wildcard alias)
		var primaryAlias string
		for _, a := range cur.aliases {
			if !strings.ContainsAny(a, "*?!") && a != "" {
				primaryAlias = a
				break
			}
		}

		if primaryAlias != "" {
			host := cur.hostName
			if host == "" {
				host = primaryAlias
			}
			port := cur.port
			if port <= 0 {
				port = 22
			}
			idKey := "ssh-config:" + strings.ToLower(primaryAlias)
			f := false
			servers = append(servers, ServerConfig{
				ID:             idKey,
				Name:           primaryAlias,
				Host:           host,
				Port:           port,
				User:           cur.user,
				PrivateKeyPath: cur.identityFile,
				HighThroughput: &f,
				Source:         "ssh-config",
			})
		}
		cur = nil
	}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		var key, val string
		if idx := strings.Index(line, "="); idx != -1 {
			key = strings.TrimSpace(line[:idx])
			val = strings.TrimSpace(line[idx+1:])
		} else {
			parts := strings.Fields(line)
			if len(parts) >= 1 {
				key = parts[0]
			}
			if len(parts) >= 2 {
				val = strings.Join(parts[1:], " ")
			}
		}

		val = strings.Trim(val, `"'`)
		keyLower := strings.ToLower(key)

		if keyLower == "host" {
			saveCurrent()
			aliases := strings.Fields(val)
			cur = &sshHostBlock{
				aliases: aliases,
				port:    22,
			}
			continue
		}

		if keyLower == "match" {
			saveCurrent()
			continue
		}

		if cur == nil {
			continue
		}

		switch keyLower {
		case "hostname":
			cur.hostName = val
		case "user":
			cur.user = val
		case "port":
			if p, err := strconv.Atoi(val); err == nil && p > 0 {
				cur.port = p
			}
		case "identityfile":
			if cur.identityFile == "" {
				if strings.HasPrefix(val, "~/") || strings.HasPrefix(val, `~\`) {
					val = filepath.Join(homeDir, val[2:])
				} else if val == "~" {
					val = homeDir
				}
				cur.identityFile = val
			}
		}
	}

	saveCurrent()
	return servers, scanner.Err()
}

func parsePuttySessionsLinux() ([]ServerConfig, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	puttyDir := filepath.Join(home, ".putty", "sessions")
	entries, err := os.ReadDir(puttyDir)
	if err != nil {
		return nil, err
	}

	var servers []ServerConfig
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "Default%20Settings" {
			continue
		}

		sessionPath := filepath.Join(puttyDir, entry.Name())
		f, err := os.Open(sessionPath)
		if err != nil {
			continue
		}

		var hostName, user, keyFile string
		port := 22

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if idx := strings.Index(line, "="); idx != -1 {
				k := line[:idx]
				v := line[idx+1:]
				switch k {
				case "HostName":
					hostName = v
				case "UserName":
					user = v
				case "PortNumber":
					if p, err := strconv.Atoi(v); err == nil && p > 0 {
						port = p
					}
				case "PublicKeyFile":
					keyFile = v
				}
			}
		}
		f.Close()

		if hostName != "" {
			name, err := url.QueryUnescape(entry.Name())
			if err != nil || name == "" {
				name = entry.Name()
			}
			f := false
			servers = append(servers, ServerConfig{
				ID:             "putty:" + entry.Name(),
				Name:           name,
				Host:           hostName,
				Port:           port,
				User:           user,
				PrivateKeyPath: keyFile,
				HighThroughput: &f,
				Source:         "putty",
			})
		}
	}
	return servers, nil
}
