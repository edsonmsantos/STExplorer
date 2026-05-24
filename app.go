package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails-bound application struct.
type App struct {
	ctx           context.Context
	configManager *ConfigManager
	sessions      map[string]*SFTPSession
	sessionMu     sync.Mutex
	transferSeq   int64

	// dropTarget is the (serverID, remoteDir) that drag-and-drop will upload into.
	// The frontend updates it whenever it navigates.
	dropTargetMu     sync.Mutex
	dropTargetServer string
	dropTargetDir    string

	// Interactive SSH terminals, keyed by terminal ID.
	terminalsMu sync.Mutex
	terminals   map[string]*Terminal
	terminalSeq int64
}

func NewApp() *App {
	return &App{
		configManager: NewConfigManager("servers.json"),
		sessions:      make(map[string]*SFTPSession),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	wailsruntime.OnFileDrop(ctx, func(_, _ int, paths []string) {
		a.handleDrop(paths)
	})
}

// shutdown closes any open SFTP sessions and terminals when the app exits.
func (a *App) shutdown(ctx context.Context) {
	a.closeAllTerminals()

	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()
	for id, s := range a.sessions {
		s.Close()
		delete(a.sessions, id)
	}
}

func (a *App) session(serverID string) (*SFTPSession, error) {
	a.sessionMu.Lock()
	defer a.sessionMu.Unlock()
	s, ok := a.sessions[serverID]
	if !ok {
		return nil, fmt.Errorf("server not connected: %s", serverID)
	}
	return s, nil
}

// ---------- Server CRUD ----------

func (a *App) GetServers() ([]ServerConfig, error) {
	return a.configManager.LoadConfigs()
}

// SaveServer inserts or updates a server. Empty ID creates a new entry.
func (a *App) SaveServer(s ServerConfig) (ServerConfig, error) {
	return a.configManager.Upsert(s)
}

// DeleteServer removes a server config and closes its open session if any.
func (a *App) DeleteServer(id string) error {
	a.sessionMu.Lock()
	if s, ok := a.sessions[id]; ok {
		s.Close()
		delete(a.sessions, id)
	}
	a.sessionMu.Unlock()
	return a.configManager.Delete(id)
}

// ---------- Connection ----------

func (a *App) ConnectToServer(serverID string) (string, error) {
	configs, err := a.configManager.LoadConfigs()
	if err != nil {
		return "", err
	}

	var target *ServerConfig
	for i := range configs {
		if configs[i].ID == serverID {
			target = &configs[i]
			break
		}
	}
	if target == nil {
		return "", fmt.Errorf("server not found: %s", serverID)
	}

	session, err := ConnectSFTP(*target)
	if err != nil {
		return "", err
	}

	a.sessionMu.Lock()
	if old, ok := a.sessions[serverID]; ok {
		old.Close()
	}
	a.sessions[serverID] = session
	a.sessionMu.Unlock()

	pwd, err := session.sftpClient.Getwd()
	if err != nil {
		return "/", nil
	}
	return pwd, nil
}

// ---------- Browsing ----------

func (a *App) ListDirectory(serverID, dirPath string) ([]FileInfo, error) {
	s, err := a.session(serverID)
	if err != nil {
		return nil, err
	}
	return s.ListDir(dirPath)
}

func (a *App) DeleteFile(serverID, p string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}
	return s.Delete(p)
}

func (a *App) RenameFile(serverID, oldPath, newPath string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}
	return s.Rename(oldPath, newPath)
}

func (a *App) MoveFile(serverID, oldPath, newPath string) error {
	return a.RenameFile(serverID, oldPath, newPath)
}

func (a *App) CreateDirectory(serverID, p string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}
	return s.CreateDir(p)
}

// ---------- Transfers ----------

// TransferEvent is emitted on the "transfer:progress" channel.
type TransferEvent struct {
	ID        int64  `json:"id"`
	Direction string `json:"direction"` // "upload" | "download" | "copy"
	FileName  string `json:"fileName"`
	Bytes     int64  `json:"bytes"`
	Total     int64  `json:"total"`
	Done      bool   `json:"done"`
	Error     string `json:"error,omitempty"`
}

func (a *App) nextTransferID() int64 {
	return atomic.AddInt64(&a.transferSeq, 1)
}

func (a *App) emitProgress(ev TransferEvent) {
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, "transfer:progress", ev)
	}
}

func (a *App) progressCallback(id int64, direction, fileName string) func(read, total int64) {
	return func(read, total int64) {
		a.emitProgress(TransferEvent{
			ID:        id,
			Direction: direction,
			FileName:  fileName,
			Bytes:     read,
			Total:     total,
		})
	}
}

func (a *App) DownloadFile(serverID, remotePath, fileName string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}

	localPath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		DefaultFilename: fileName,
		Title:           "Save File",
	})
	if err != nil || localPath == "" {
		return err
	}

	id := a.nextTransferID()
	cb := a.progressCallback(id, "download", fileName)
	err = s.DownloadFile(remotePath, localPath, cb)
	a.emitProgress(TransferEvent{
		ID: id, Direction: "download", FileName: fileName, Done: true,
		Error: errString(err),
	})
	return err
}

func (a *App) UploadFile(serverID, remoteDir string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}

	localPath, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select file to upload",
	})
	if err != nil || localPath == "" {
		return err
	}

	return a.uploadOne(s, localPath, remoteDir)
}

// PasteFromClipboard reads file paths from the system clipboard and uploads
// them to remoteDir. Returns the list of paths it consumed (so the UI can
// show a useful message). Currently Windows-only; other platforms return nil.
func (a *App) PasteFromClipboard(serverID, remoteDir string) ([]string, error) {
	paths, err := readClipboardFiles()
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, nil
	}
	if err := a.UploadFiles(serverID, remoteDir, paths); err != nil {
		return nil, err
	}
	return paths, nil
}

// UploadFiles uploads a batch of local files (used by drag-and-drop).
func (a *App) UploadFiles(serverID, remoteDir string, localPaths []string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}
	for _, p := range localPaths {
		if err := a.uploadOne(s, p, remoteDir); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) uploadOne(s *SFTPSession, localPath, remoteDir string) error {
	name := filepath.Base(localPath)
	remotePath := path.Join(remoteDir, name)
	if remoteDir == "/" {
		remotePath = "/" + name
	}

	id := a.nextTransferID()
	cb := a.progressCallback(id, "upload", name)
	err := s.UploadFile(localPath, remotePath, cb)
	a.emitProgress(TransferEvent{
		ID: id, Direction: "upload", FileName: name, Done: true,
		Error: errString(err),
	})
	return err
}

func (a *App) CopyFile(serverID, srcPath, dstPath string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}

	name := filepath.Base(srcPath)
	id := a.nextTransferID()
	cb := a.progressCallback(id, "copy", name)
	err = s.CopyRemote(srcPath, dstPath, cb)
	a.emitProgress(TransferEvent{
		ID: id, Direction: "copy", FileName: name, Done: true,
		Error: errString(err),
	})
	return err
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// ---------- Open ----------

func (a *App) OpenFile(serverID, remotePath, fileName string) error {
	s, err := a.session(serverID)
	if err != nil {
		return err
	}

	localPath := filepath.Join(os.TempDir(), fileName)
	id := a.nextTransferID()
	cb := a.progressCallback(id, "download", fileName)
	if err := s.DownloadFile(remotePath, localPath, cb); err != nil {
		a.emitProgress(TransferEvent{ID: id, Direction: "download", FileName: fileName, Done: true, Error: err.Error()})
		return fmt.Errorf("failed to download for opening: %w", err)
	}
	a.emitProgress(TransferEvent{ID: id, Direction: "download", FileName: fileName, Done: true})
	return openLocalPath(localPath)
}

func openLocalPath(p string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("cmd", "/c", "start", "", p).Start()
	case "darwin":
		return exec.Command("open", p).Start()
	default:
		return exec.Command("xdg-open", p).Start()
	}
}

// ---------- Drag and drop ----------

// SetDropTarget tells the backend which (server, dir) drag-drop should upload into.
func (a *App) SetDropTarget(serverID, dir string) {
	a.dropTargetMu.Lock()
	defer a.dropTargetMu.Unlock()
	a.dropTargetServer = serverID
	a.dropTargetDir = dir
}

func (a *App) handleDrop(paths []string) {
	a.dropTargetMu.Lock()
	srv := a.dropTargetServer
	dir := a.dropTargetDir
	a.dropTargetMu.Unlock()

	if srv == "" || len(paths) == 0 {
		return
	}

	go func() {
		err := a.UploadFiles(srv, dir, paths)
		if err != nil && a.ctx != nil {
			wailsruntime.EventsEmit(a.ctx, "drop:error", err.Error())
		} else if a.ctx != nil {
			wailsruntime.EventsEmit(a.ctx, "drop:done", dir)
		}
	}()
}
