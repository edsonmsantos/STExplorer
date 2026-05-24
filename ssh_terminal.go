package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"sync/atomic"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// Terminal wraps a single interactive SSH session with a PTY.
type Terminal struct {
	id      string
	session *ssh.Session
	stdin   io.WriteCloser
	closed  atomic.Bool
}

func (t *Terminal) close() {
	if t.closed.Swap(true) {
		return
	}
	if t.stdin != nil {
		t.stdin.Close()
	}
	if t.session != nil {
		t.session.Close()
	}
}

// shellQuote single-quotes a path for safe inclusion in a shell command.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// OpenTerminal launches an SSH shell on the connected server, requests a PTY,
// `cd`s to dir if set, and starts pumping output back to the frontend as
// terminal:data events. Returns the terminal ID used to address it later.
func (a *App) OpenTerminal(serverID, dir string, cols, rows int) (string, error) {
	sftp, err := a.session(serverID)
	if err != nil {
		return "", err
	}

	sshSession, err := sftp.sshClient.NewSession()
	if err != nil {
		return "", fmt.Errorf("SSH shell not supported by this server: %w", err)
	}

	if cols <= 0 {
		cols = 100
	}
	if rows <= 0 {
		rows = 30
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := sshSession.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		sshSession.Close()
		return "", fmt.Errorf("failed to request PTY: %w", err)
	}

	stdin, err := sshSession.StdinPipe()
	if err != nil {
		sshSession.Close()
		return "", err
	}
	stdout, err := sshSession.StdoutPipe()
	if err != nil {
		sshSession.Close()
		return "", err
	}
	stderr, err := sshSession.StderrPipe()
	if err != nil {
		sshSession.Close()
		return "", err
	}

	if err := sshSession.Shell(); err != nil {
		sshSession.Close()
		return "", fmt.Errorf("failed to start shell: %w", err)
	}

	id := fmt.Sprintf("term-%d", atomic.AddInt64(&a.terminalSeq, 1))
	term := &Terminal{id: id, session: sshSession, stdin: stdin}

	a.terminalsMu.Lock()
	if a.terminals == nil {
		a.terminals = make(map[string]*Terminal)
	}
	a.terminals[id] = term
	a.terminalsMu.Unlock()

	// Pump stdout + stderr. Emit base64-encoded data so binary bytes round-trip
	// cleanly through JSON.
	go pumpToFrontend(a, id, stdout)
	go pumpToFrontend(a, id, stderr)

	// Optional initial cd. Doing it as a shell command keeps it consistent
	// with whatever shell the server uses.
	if dir != "" {
		_, _ = stdin.Write([]byte(" cd " + shellQuote(dir) + " && clear\n"))
	}

	// Wait for the shell to exit so we can clean up.
	go func() {
		_ = sshSession.Wait()
		if a.ctx != nil {
			wailsruntime.EventsEmit(a.ctx, "terminal:close", id)
		}
		a.terminalsMu.Lock()
		delete(a.terminals, id)
		a.terminalsMu.Unlock()
		term.close()
	}()

	return id, nil
}

func pumpToFrontend(a *App, id string, r io.Reader) {
	buf := make([]byte, 8192)
	for {
		n, err := r.Read(buf)
		if n > 0 && a.ctx != nil {
			payload := base64.StdEncoding.EncodeToString(buf[:n])
			wailsruntime.EventsEmit(a.ctx, "terminal:data", id, payload)
		}
		if err != nil {
			return
		}
	}
}

// SendTerminalInput writes user keystrokes (already decoded by xterm) to the
// shell's stdin.
func (a *App) SendTerminalInput(id, data string) error {
	a.terminalsMu.Lock()
	t := a.terminals[id]
	a.terminalsMu.Unlock()
	if t == nil {
		return fmt.Errorf("terminal not found: %s", id)
	}
	_, err := t.stdin.Write([]byte(data))
	return err
}

func (a *App) ResizeTerminal(id string, cols, rows int) error {
	a.terminalsMu.Lock()
	t := a.terminals[id]
	a.terminalsMu.Unlock()
	if t == nil {
		return fmt.Errorf("terminal not found: %s", id)
	}
	return t.session.WindowChange(rows, cols)
}

func (a *App) CloseTerminal(id string) error {
	a.terminalsMu.Lock()
	t := a.terminals[id]
	delete(a.terminals, id)
	a.terminalsMu.Unlock()
	if t == nil {
		return nil
	}
	t.close()
	return nil
}

// closeAllTerminals is called from app.shutdown.
func (a *App) closeAllTerminals() {
	a.terminalsMu.Lock()
	terms := a.terminals
	a.terminals = nil
	a.terminalsMu.Unlock()
	for _, t := range terms {
		t.close()
	}
}

