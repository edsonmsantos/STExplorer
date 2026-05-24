//go:build !windows

package main

func readClipboardFiles() ([]string, error) {
	return nil, nil
}
