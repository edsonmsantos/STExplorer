package main

import (
	"strings"
	"testing"
)

func TestParseOpenSSHConfigReader(t *testing.T) {
	input := `
# Global default configuration
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3

Host my-vps
    HostName 198.51.100.10
    User ubuntu
    Port 2222
    IdentityFile ~/.ssh/id_ed25519

Host test-server alias2
    HostName=10.0.0.5
    User=admin
    IdentityFile="~/keys/custom.pem"

Host raw-ip-host
    User root

Host *.wildcard.net
    User dev
`

	servers, err := parseOpenSSHConfigReader(strings.NewReader(input), "/home/testuser")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(servers) != 3 {
		t.Fatalf("expected 3 servers, got %d", len(servers))
	}

	// Server 1
	s1 := servers[0]
	if s1.Name != "my-vps" || s1.Host != "198.51.100.10" || s1.User != "ubuntu" || s1.Port != 2222 {
		t.Errorf("s1 mismatch: %+v", s1)
	}
	if s1.PrivateKeyPath != "/home/testuser/.ssh/id_ed25519" {
		t.Errorf("s1 PrivateKeyPath mismatch: %s", s1.PrivateKeyPath)
	}
	if s1.Source != "ssh-config" {
		t.Errorf("s1 Source mismatch: %s", s1.Source)
	}

	// Server 2
	s2 := servers[1]
	if s2.Name != "test-server" || s2.Host != "10.0.0.5" || s2.User != "admin" || s2.Port != 22 {
		t.Errorf("s2 mismatch: %+v", s2)
	}
	if s2.PrivateKeyPath != "/home/testuser/keys/custom.pem" {
		t.Errorf("s2 PrivateKeyPath mismatch: %s", s2.PrivateKeyPath)
	}

	// Server 3
	s3 := servers[2]
	if s3.Name != "raw-ip-host" || s3.Host != "raw-ip-host" || s3.User != "root" || s3.Port != 22 {
		t.Errorf("s3 mismatch: %+v", s3)
	}
}
