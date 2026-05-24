package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

type FileInfo struct {
	Name  string    `json:"name"`
	Size  int64     `json:"size"`
	IsDir bool      `json:"isDir"`
	Mode  string    `json:"mode"`
	Time  time.Time `json:"time"`
}

type SFTPSession struct {
	sshClient  *ssh.Client
	sftpClient *sftp.Client
}

func (s *SFTPSession) Close() {
	if s.sftpClient != nil {
		s.sftpClient.Close()
	}
	if s.sshClient != nil {
		s.sshClient.Close()
	}
}

// knownHostsPath returns the per-user known_hosts file, creating it if needed.
func knownHostsPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "Explorer")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	p := filepath.Join(dir, "known_hosts")
	if _, err := os.Stat(p); os.IsNotExist(err) {
		f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY, 0600)
		if err != nil {
			return "", err
		}
		f.Close()
	}
	return p, nil
}

func tofuHostKeyCallback() (ssh.HostKeyCallback, error) {
	khPath, err := knownHostsPath()
	if err != nil {
		return nil, err
	}
	verify, err := knownhosts.New(khPath)
	if err != nil {
		return nil, err
	}

	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		if err := verify(hostname, remote, key); err == nil {
			return nil
		} else {
			if kerr, ok := err.(*knownhosts.KeyError); ok && len(kerr.Want) == 0 {
				return appendKnownHost(khPath, hostname, remote, key)
			}
			return fmt.Errorf("host key verification failed for %s: %w", hostname, err)
		}
	}, nil
}

func appendKnownHost(path, hostname string, remote net.Addr, key ssh.PublicKey) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0600)
	if err != nil {
		return err
	}
	defer f.Close()

	addrs := []string{knownhosts.Normalize(hostname)}
	if remote != nil {
		if ra := knownhosts.Normalize(remote.String()); ra != addrs[0] {
			addrs = append(addrs, ra)
		}
	}
	if _, err := f.WriteString(knownhosts.Line(addrs, key) + "\n"); err != nil {
		return err
	}
	return nil
}

func buildAuthMethods(config ServerConfig) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	if config.PrivateKeyPath != "" {
		// Users often paste paths with surrounding quotes or whitespace.
		pkPath := strings.Trim(strings.TrimSpace(config.PrivateKeyPath), `"'`)

		keyBytes, err := os.ReadFile(pkPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read private key %s: %w", pkPath, err)
		}

		signer, err := parsePrivateKey(keyBytes, config.Passphrase)
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key at %s: %w", pkPath, err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if config.Password != "" {
		methods = append(methods, ssh.Password(config.Password))
	}

	if len(methods) == 0 {
		return nil, errors.New("no authentication method configured (provide password or privateKeyPath)")
	}
	return methods, nil
}

// parsePrivateKey is a wrapper around ssh.ParsePrivateKey that strips common
// noise (UTF-8/16 BOMs, leading whitespace) and turns the cryptic "no key
// found" error into something actionable when the user pointed at the wrong
// file or forgot the passphrase.
func parsePrivateKey(keyBytes []byte, passphrase string) (ssh.Signer, error) {
	// Strip BOMs.
	if bytes.HasPrefix(keyBytes, []byte{0xEF, 0xBB, 0xBF}) {
		keyBytes = keyBytes[3:]
	} else if bytes.HasPrefix(keyBytes, []byte{0xFF, 0xFE}) || bytes.HasPrefix(keyBytes, []byte{0xFE, 0xFF}) {
		return nil, errors.New("key file is UTF-16 encoded — re-save it as UTF-8 (PowerShell's default `>` redirect writes UTF-16)")
	}
	keyBytes = bytes.TrimLeft(keyBytes, " \t\r\n")

	if len(bytes.TrimSpace(keyBytes)) == 0 {
		return nil, errors.New("file is empty")
	}
	if bytes.HasPrefix(keyBytes, []byte("ssh-")) ||
		bytes.HasPrefix(keyBytes, []byte("ecdsa-")) ||
		bytes.HasPrefix(keyBytes, []byte("sk-")) {
		return nil, errors.New("this is a PUBLIC key (.pub) — point to the PRIVATE key file (usually the same name without .pub)")
	}
	if bytes.HasPrefix(keyBytes, []byte("PuTTY-User-Key-File-")) {
		return nil, errors.New("PuTTY .ppk format is not supported. In PuTTYgen open the .ppk and use Conversions → Export OpenSSH key, then point to the exported file")
	}
	if bytes.HasPrefix(keyBytes, []byte("---- BEGIN SSH2")) {
		return nil, errors.New("SSH2 (RFC 4716) format is not supported. Convert with: ssh-keygen -p -m PEM -f <your-key-file>")
	}
	if !bytes.Contains(keyBytes, []byte("-----BEGIN")) {
		return nil, errors.New("unsupported key format (no PEM '-----BEGIN' header found). Expected an OpenSSH/PEM private key")
	}

	if passphrase != "" {
		return ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(passphrase))
	}

	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		var pmErr *ssh.PassphraseMissingError
		if errors.As(err, &pmErr) {
			return nil, errors.New("private key is encrypted — fill in the Passphrase field in the server settings")
		}
		return nil, err
	}
	return signer, nil
}

func ConnectSFTP(config ServerConfig) (*SFTPSession, error) {
	hostKeyCallback, err := tofuHostKeyCallback()
	if err != nil {
		return nil, fmt.Errorf("failed to init host key store: %w", err)
	}

	auth, err := buildAuthMethods(config)
	if err != nil {
		return nil, err
	}

	sshConfig := &ssh.ClientConfig{
		User:            config.User,
		Auth:            auth,
		HostKeyCallback: hostKeyCallback,
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", config.Host, config.Port)
	conn, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to dial ssh: %w", err)
	}

	// Throughput tuning. In high-throughput mode (default) we use 256 KB
	// packets and a wider concurrency window — modern OpenSSH-based servers
	// handle this fine and it's the difference between ~10 MB/s and saturating
	// the link on high-RTT routes. Some restricted SFTP services (e.g. Hetzner
	// Storage Box) drop the connection when sent >32 KB payloads; in that case
	// the upload error handler flips the server's HighThroughput flag to false
	// and the next reconnect lands in safe mode.
	opts := []sftp.ClientOption{
		sftp.UseConcurrentReads(true),
		sftp.UseConcurrentWrites(true),
	}
	if config.UseHighThroughput() {
		opts = append(opts,
			sftp.MaxPacketUnchecked(256*1024),
			sftp.MaxConcurrentRequestsPerFile(128),
		)
	}
	client, err := sftp.NewClient(conn, opts...)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to create sftp client: %w", err)
	}

	return &SFTPSession{
		sshClient:  conn,
		sftpClient: client,
	}, nil
}

func (s *SFTPSession) ListDir(p string) ([]FileInfo, error) {
	if p == "" {
		p = "."
	}
	files, err := s.sftpClient.ReadDir(p)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory '%s': %w", p, err)
	}

	result := make([]FileInfo, 0, len(files))
	for _, f := range files {
		result = append(result, FileInfo{
			Name:  f.Name(),
			Size:  f.Size(),
			IsDir: f.IsDir(),
			Mode:  f.Mode().String(),
			Time:  f.ModTime(),
		})
	}
	return result, nil
}

// progressReader wraps an io.Reader and invokes onTick on every read.
type progressReader struct {
	r       io.Reader
	read    int64
	total   int64
	onTick  func(read, total int64)
	lastEmit time.Time
}

func (p *progressReader) Read(buf []byte) (int, error) {
	n, err := p.r.Read(buf)
	if n > 0 {
		atomic.AddInt64(&p.read, int64(n))
		now := time.Now()
		if now.Sub(p.lastEmit) > 80*time.Millisecond || err == io.EOF {
			p.lastEmit = now
			if p.onTick != nil {
				p.onTick(atomic.LoadInt64(&p.read), p.total)
			}
		}
	}
	return n, err
}

func (s *SFTPSession) DownloadFile(remotePath, localPath string, onProgress func(read, total int64)) error {
	srcFile, err := s.sftpClient.Open(remotePath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	info, err := srcFile.Stat()
	if err != nil {
		return err
	}

	dstFile, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	reader := &progressReader{r: srcFile, total: info.Size(), onTick: onProgress}
	_, err = io.Copy(dstFile, reader)
	return err
}

func (s *SFTPSession) UploadFile(localPath, remotePath string, onProgress func(read, total int64)) error {
	srcFile, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	info, err := srcFile.Stat()
	if err != nil {
		return err
	}

	dstFile, err := s.sftpClient.Create(remotePath)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	reader := &progressReader{r: srcFile, total: info.Size(), onTick: onProgress}
	_, err = io.Copy(dstFile, reader)
	return err
}

// CopyRemote copies a file or directory tree inside the same SFTP server.
func (s *SFTPSession) CopyRemote(srcPath, dstPath string, onProgress func(read, total int64)) error {
	info, err := s.sftpClient.Stat(srcPath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return s.copyTree(srcPath, dstPath, onProgress)
	}
	return s.copyOneFile(srcPath, dstPath, info.Size(), onProgress)
}

func (s *SFTPSession) copyOneFile(src, dst string, size int64, onProgress func(read, total int64)) error {
	srcFile, err := s.sftpClient.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := s.sftpClient.Create(dst)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	reader := &progressReader{r: srcFile, total: size, onTick: onProgress}
	_, err = io.Copy(dstFile, reader)
	return err
}

func (s *SFTPSession) copyTree(src, dst string, onProgress func(read, total int64)) error {
	if err := s.sftpClient.Mkdir(dst); err != nil {
		if _, statErr := s.sftpClient.Stat(dst); statErr != nil {
			return fmt.Errorf("failed to create dir %s: %w", dst, err)
		}
	}
	entries, err := s.sftpClient.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		childSrc := path.Join(src, e.Name())
		childDst := path.Join(dst, e.Name())
		if e.IsDir() {
			if err := s.copyTree(childSrc, childDst, onProgress); err != nil {
				return err
			}
		} else {
			if err := s.copyOneFile(childSrc, childDst, e.Size(), onProgress); err != nil {
				return err
			}
		}
	}
	return nil
}

// Delete removes a file or, for directories, the entire tree.
func (s *SFTPSession) Delete(p string) error {
	info, err := s.sftpClient.Stat(p)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return s.deleteTree(p)
	}
	return s.sftpClient.Remove(p)
}

func (s *SFTPSession) deleteTree(p string) error {
	entries, err := s.sftpClient.ReadDir(p)
	if err != nil {
		return err
	}
	for _, e := range entries {
		child := path.Join(p, e.Name())
		if e.IsDir() {
			if err := s.deleteTree(child); err != nil {
				return err
			}
		} else {
			if err := s.sftpClient.Remove(child); err != nil {
				return err
			}
		}
	}
	return s.sftpClient.RemoveDirectory(p)
}

func (s *SFTPSession) CreateDir(p string) error {
	return s.sftpClient.Mkdir(p)
}

func (s *SFTPSession) Rename(oldPath, newPath string) error {
	return s.sftpClient.Rename(oldPath, newPath)
}
