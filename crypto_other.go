//go:build !windows

package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
	"os"
	"path/filepath"
)

// On non-Windows platforms we fall back to AES-256-GCM with a per-user key
// kept at <config>/Explorer/key with 0600 permissions. This is weaker than
// DPAPI (anyone with read access to the key file can decrypt servers.json),
// but still much better than plaintext.

func keyPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "Explorer")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	return filepath.Join(dir, "key"), nil
}

func loadOrCreateKey() ([]byte, error) {
	p, err := keyPath()
	if err != nil {
		return nil, err
	}
	if data, err := os.ReadFile(p); err == nil {
		if len(data) != 32 {
			return nil, errors.New("corrupted encryption key file")
		}
		return data, nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(p, key, 0600); err != nil {
		return nil, err
	}
	return key, nil
}

func encryptBytes(data []byte) ([]byte, error) {
	key, err := loadOrCreateKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, data, nil), nil
}

func decryptBytes(data []byte) ([]byte, error) {
	key, err := loadOrCreateKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(data) < gcm.NonceSize() {
		return nil, errors.New("encrypted data too short")
	}
	nonce := data[:gcm.NonceSize()]
	ct := data[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}
