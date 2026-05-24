package main

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// Secrets at rest are stored as "enc:v1:<base64(ciphertext)>" so we can
// distinguish encrypted blobs from legacy plaintext entries and migrate
// transparently.
const encryptionPrefix = "enc:v1:"

func isEncrypted(s string) bool {
	return strings.HasPrefix(s, encryptionPrefix)
}

// EncryptSecret encrypts a plaintext string for at-rest storage. Empty
// input returns empty output. Already-encrypted input is passed through.
func EncryptSecret(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	if isEncrypted(plaintext) {
		return plaintext, nil
	}
	ct, err := encryptBytes([]byte(plaintext))
	if err != nil {
		return "", fmt.Errorf("encrypt: %w", err)
	}
	return encryptionPrefix + base64.StdEncoding.EncodeToString(ct), nil
}

// DecryptSecret reverses EncryptSecret. Legacy plaintext (no prefix) is
// returned as-is so the upgrade path "just works".
func DecryptSecret(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	if !isEncrypted(stored) {
		return stored, nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, encryptionPrefix))
	if err != nil {
		return "", fmt.Errorf("decrypt (base64): %w", err)
	}
	plaintext, err := decryptBytes(raw)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plaintext), nil
}
