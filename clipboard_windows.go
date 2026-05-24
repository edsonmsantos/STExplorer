//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	shell32              = syscall.NewLazyDLL("shell32.dll")
	procOpenClipboard    = user32.NewProc("OpenClipboard")
	procCloseClipboard   = user32.NewProc("CloseClipboard")
	procGetClipboardData = user32.NewProc("GetClipboardData")
	procDragQueryFileW   = shell32.NewProc("DragQueryFileW")
)

const cfHdrop = 15

// readClipboardFiles returns file paths currently held on the Windows
// clipboard (CF_HDROP format — what Explorer's Ctrl+C produces).
func readClipboardFiles() ([]string, error) {
	ret, _, err := procOpenClipboard.Call(0)
	if ret == 0 {
		return nil, fmt.Errorf("OpenClipboard failed: %v", err)
	}
	defer procCloseClipboard.Call()

	hMem, _, _ := procGetClipboardData.Call(cfHdrop)
	if hMem == 0 {
		return nil, nil
	}

	count, _, _ := procDragQueryFileW.Call(hMem, 0xFFFFFFFF, 0, 0)
	if count == 0 {
		return nil, nil
	}

	files := make([]string, 0, count)
	buf := make([]uint16, 32768)
	for i := uintptr(0); i < count; i++ {
		n, _, _ := procDragQueryFileW.Call(
			hMem,
			i,
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(len(buf)),
		)
		if n == 0 {
			continue
		}
		files = append(files, syscall.UTF16ToString(buf[:n]))
	}
	return files, nil
}
