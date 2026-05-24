import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    GetServers,
    ConnectToServer,
    ListDirectory,
    CreateDirectory,
    DeleteFile,
    DownloadFile,
    UploadFile,
    RenameFile,
    MoveFile,
    CopyFile,
    OpenFile,
    SaveServer,
    DeleteServer,
    SetDropTarget,
    PasteFromClipboard,
} from '../wailsjs/go/main/App';
import { EventsOn, EventsOff, WindowSetTitle } from '../wailsjs/runtime';
import { useModals } from './components/Modals';
import ServerForm from './components/ServerForm';
import TransferPanel from './components/TransferPanel';
import FileList from './components/FileList';
import FileColumns from './components/FileColumns';
import TerminalPanel, { spawnTerminal, destroyTerminal } from './components/TerminalPanel';
import {
    FolderIcon,
    FileIcon,
    ChevronLeft,
    Upload,
    FolderPlus,
    Clipboard,
    Search,
    Grid,
    List,
    Plus,
    Refresh,
    ServerIcon,
    Home,
    TerminalIcon,
} from './components/Icons';

const joinPath = (base, name) => (base === '/' ? `/${name}` : `${base}/${name}`);
const parentPath = (p) => {
    if (!p || p === '/') return '/';
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
};

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatDate = (t) => {
    if (!t) return '';
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

const SORT_KEYS = {
    name: (a, b) => a.name.localeCompare(b.name),
    size: (a, b) => a.size - b.size,
    time: (a, b) => new Date(a.time) - new Date(b.time),
};

// Three view modes: 'icons' | 'list' | 'columns' (Finder-style Miller columns).

function App() {
    const { prompt, confirm, custom } = useModals();

    const [servers, setServers] = useState([]);
    const [currentServer, setCurrentServer] = useState(null);
    // Unified state: array of {path, files, expandedName}. Flat views use a
    // single column; column view appends as the user drills in.
    const [columns, setColumns] = useState([]);
    // focused = {colIdx, name} | null. The "selected item" for operations.
    const [focused, setFocused] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [serverMenu, setServerMenu] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [sortBy, setSortBy] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [query, setQuery] = useState('');
    const [view, setView] = useState('columns');
    const [dragOver, setDragOver] = useState(false);
    const fileAreaRef = useRef(null);

    // Terminal tabs
    const [terminalTabs, setTerminalTabs] = useState([]); // [{id, label, serverId}]
    const [activeTerminalId, setActiveTerminalId] = useState(null);
    const [terminalOpen, setTerminalOpen] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(280);

    // ---------- derived state ----------
    const deepestColumn = columns[columns.length - 1];
    const currentPath = deepestColumn?.path || '';

    const focusedColumn = focused ? columns[focused.colIdx] : null;
    const currentSelected = useMemo(() => {
        if (!focused || !focusedColumn) return null;
        return focusedColumn.files.find((f) => f.name === focused.name) || null;
    }, [focused, focusedColumn]);

    const currentSelectedPath = useMemo(() => {
        if (!focused || !focusedColumn) return null;
        return joinPath(focusedColumn.path, focused.name);
    }, [focused, focusedColumn]);

    // ---------- sorting / filtering ----------
    const sortFiles = useCallback((arr) => {
        const cmp = SORT_KEYS[sortBy] || SORT_KEYS.name;
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...arr].sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return cmp(a, b) * dir;
        });
    }, [sortBy, sortDir]);

    const visibleFiles = useMemo(() => {
        if (!deepestColumn) return [];
        const filtered = query
            ? deepestColumn.files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
            : deepestColumn.files;
        return sortFiles(filtered);
    }, [deepestColumn, query, sortFiles]);

    const renderedColumns = useMemo(() => {
        return columns.map((c, i) => ({
            ...c,
            files: sortFiles(
                i === columns.length - 1 && query
                    ? c.files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
                    : c.files
            ),
        }));
    }, [columns, sortFiles, query]);

    const breadcrumbs = useMemo(() => {
        if (!currentPath) return [];
        if (currentPath === '/') return [{ name: '/', path: '/' }];
        const parts = currentPath.split('/').filter(Boolean);
        const crumbs = [{ name: '/', path: '/' }];
        let acc = '';
        for (const p of parts) {
            acc += '/' + p;
            crumbs.push({ name: p, path: acc });
        }
        return crumbs;
    }, [currentPath]);

    // ---------- effects ----------
    const loadServers = useCallback(async () => {
        try {
            const result = await GetServers();
            setServers(result || []);
        } catch (err) {
            setError('Failed to load servers: ' + err);
        }
    }, []);

    useEffect(() => {
        loadServers();
        const closeMenus = () => { setContextMenu(null); setServerMenu(null); };
        window.addEventListener('click', closeMenus);
        return () => window.removeEventListener('click', closeMenus);
    }, [loadServers]);

    // Keep the backend's drop target in sync with the deepest column.
    useEffect(() => {
        if (currentServer && currentPath) {
            SetDropTarget(currentServer.id, currentPath).catch(() => {});
        }
    }, [currentServer, currentPath]);

    // Reflect the active connection in the window title.
    useEffect(() => {
        try {
            if (currentServer) {
                WindowSetTitle(`Explorer — ${currentServer.name}`);
            } else {
                WindowSetTitle('Explorer');
            }
        } catch (_) {}
    }, [currentServer]);

    useEffect(() => {
        const refresh = () => refreshDeepest();
        const onErr = (msg) => setError('Upload from drop failed: ' + msg);
        EventsOn('drop:done', refresh);
        EventsOn('drop:error', onErr);
        return () => {
            EventsOff('drop:done');
            EventsOff('drop:error');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentServer, columns]);

    useEffect(() => {
        const el = fileAreaRef.current;
        if (!el) return;
        const observer = new MutationObserver(() => {
            setDragOver(el.style.getPropertyValue('--wails-drop-target') === 'drop');
        });
        observer.observe(el, { attributes: true, attributeFilter: ['style'] });
        return () => observer.disconnect();
    }, []);

    // ---------- loading / refresh ----------
    const loadRoot = useCallback(async (serverId, dirPath) => {
        // Show a loading placeholder immediately so the UI never feels frozen.
        setColumns([{ path: dirPath, files: [], expandedName: null, loading: true }]);
        setFocused(null);
        try {
            const result = await ListDirectory(serverId, dirPath);
            setColumns((prev) => {
                if (prev[0]?.path !== dirPath) return prev; // user navigated elsewhere
                return [{ path: dirPath, files: result || [], expandedName: null, loading: false }];
            });
            setError(null);
        } catch (err) {
            setError('Failed to list directory: ' + err);
            setColumns((prev) => (prev[0]?.path === dirPath ? [] : prev));
        }
    }, []);

    const refreshDeepest = useCallback(async () => {
        if (!currentServer || columns.length === 0) return;
        const deepest = columns[columns.length - 1];
        try {
            const result = await ListDirectory(currentServer.id, deepest.path);
            const newFiles = result || [];
            setColumns((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                next[next.length - 1] = {
                    ...last,
                    files: newFiles,
                    expandedName: newFiles.some((f) => f.name === last.expandedName)
                        ? last.expandedName
                        : null,
                };
                return next;
            });
            if (focused && focused.colIdx === columns.length - 1) {
                if (!newFiles.some((f) => f.name === focused.name)) {
                    setFocused(null);
                }
            }
        } catch (err) {
            setError('Failed to refresh: ' + err);
        }
    }, [currentServer, columns, focused]);

    // ---------- handlers ----------
    const handleConnect = async (server) => {
        setLoading(true);
        setError(null);
        try {
            const initialPath = await ConnectToServer(server.id);
            setCurrentServer(server);
            await loadRoot(server.id, initialPath);
        } catch (err) {
            setError('Connection failed: ' + err);
        } finally {
            setLoading(false);
        }
    };

    // Single click: focus item. In columns view, also expand folders.
    const handleSelect = useCallback(async (colIdx, file) => {
        setFocused({ colIdx, name: file.name });

        if (view === 'columns' && file.isDir) {
            const childPath = joinPath(columns[colIdx].path, file.name);
            // Optimistic placeholder so the next column appears with a spinner
            // before the network response lands.
            setColumns((prev) => {
                const next = prev.slice(0, colIdx + 1);
                next[colIdx] = { ...next[colIdx], expandedName: file.name };
                next.push({ path: childPath, files: [], expandedName: null, loading: true });
                return next;
            });
            try {
                const result = await ListDirectory(currentServer.id, childPath);
                setColumns((prev) => {
                    // Only replace the placeholder if it's still the active one.
                    const idx = prev.findIndex((c) => c.path === childPath && c.loading);
                    if (idx < 0) return prev;
                    const next = [...prev];
                    next[idx] = { path: childPath, files: result || [], expandedName: null, loading: false };
                    return next;
                });
            } catch (err) {
                setError('Failed to list directory: ' + err);
                setColumns((prev) => prev.filter((c) => !(c.path === childPath && c.loading)));
            }
        } else if (view === 'columns') {
            // File: collapse anything below.
            setColumns((prev) => {
                const next = prev.slice(0, colIdx + 1);
                next[colIdx] = { ...next[colIdx], expandedName: null };
                return next;
            });
        }
    }, [view, columns, currentServer]);

    const handleActivate = useCallback(async (colIdx, file) => {
        if (file.isDir) {
            if (view === 'columns') {
                // Single click already expanded; nothing to do.
                handleSelect(colIdx, file);
            } else {
                await loadRoot(currentServer.id, joinPath(columns[colIdx].path, file.name));
            }
        } else {
            try {
                await OpenFile(currentServer.id, joinPath(columns[colIdx].path, file.name), file.name);
            } catch (err) {
                setError('Failed to open file: ' + err);
            }
        }
    }, [view, columns, currentServer, loadRoot, handleSelect]);

    const goBack = useCallback(() => {
        if (!currentServer) return;
        if (view === 'columns' && columns.length > 1) {
            setColumns((prev) => {
                const trimmed = prev.slice(0, -1);
                trimmed[trimmed.length - 1] = { ...trimmed[trimmed.length - 1], expandedName: null };
                return trimmed;
            });
            setFocused(null);
            return;
        }
        if (currentPath && currentPath !== '/') {
            loadRoot(currentServer.id, parentPath(currentPath));
        }
    }, [view, columns, currentServer, currentPath, loadRoot]);

    const goToBreadcrumb = useCallback(async (targetPath) => {
        if (!currentServer) return;
        if (view === 'columns') {
            const idx = columns.findIndex((c) => c.path === targetPath);
            if (idx >= 0) {
                setColumns((prev) => {
                    const trimmed = prev.slice(0, idx + 1);
                    trimmed[idx] = { ...trimmed[idx], expandedName: null };
                    return trimmed;
                });
                setFocused(null);
                return;
            }
        }
        await loadRoot(currentServer.id, targetPath);
    }, [view, columns, currentServer, loadRoot]);

    const handleViewChange = (newView) => {
        if (newView === view) return;
        if (newView !== 'columns' && columns.length > 1) {
            const deepest = columns[columns.length - 1];
            setColumns([{ ...deepest, expandedName: null }]);
            setFocused(
                focused && focused.colIdx === columns.length - 1 ? { colIdx: 0, name: focused.name } : null
            );
        }
        setView(newView);
    };

    const handleContextMenu = (e, colIdx, file) => {
        e.preventDefault();
        e.stopPropagation();
        if (file) {
            handleSelect(colIdx, file);
            setContextMenu({ x: e.clientX, y: e.clientY, file });
        } else {
            // Empty area within a column or flat view: collapse below and clear focus.
            if (typeof colIdx === 'number') {
                setColumns((prev) => {
                    const trimmed = prev.slice(0, colIdx + 1);
                    trimmed[colIdx] = { ...trimmed[colIdx], expandedName: null };
                    return trimmed;
                });
            }
            setFocused(null);
            setContextMenu({ x: e.clientX, y: e.clientY, file: null });
        }
    };

    const handleCreateFolder = async () => {
        const name = await prompt({ title: 'New folder', placeholder: 'Folder name', confirmLabel: 'Create' });
        if (!name) return;
        try {
            await CreateDirectory(currentServer.id, joinPath(currentPath, name));
            await refreshDeepest();
        } catch (err) {
            setError('Failed to create folder: ' + err);
        }
    };

    const handleDelete = useCallback(async () => {
        if (!currentSelected || !currentSelectedPath) return;
        const ok = await confirm({
            title: 'Delete?',
            message: `${currentSelected.name}${currentSelected.isDir ? ' (and everything inside)' : ''} will be permanently removed.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        try {
            await DeleteFile(currentServer.id, currentSelectedPath);
            await refreshDeepest();
        } catch (err) {
            setError('Failed to delete: ' + err);
        }
    }, [currentSelected, currentSelectedPath, currentServer, confirm, refreshDeepest]);

    const handleRename = useCallback(async () => {
        if (!currentSelected || !focusedColumn) return;
        const newName = await prompt({
            title: 'Rename',
            defaultValue: currentSelected.name,
            confirmLabel: 'Rename',
        });
        if (!newName || newName === currentSelected.name) return;
        try {
            await RenameFile(
                currentServer.id,
                joinPath(focusedColumn.path, currentSelected.name),
                joinPath(focusedColumn.path, newName)
            );
            setFocused(null);
            await refreshDeepest();
        } catch (err) {
            setError('Failed to rename: ' + err);
        }
    }, [currentSelected, focusedColumn, currentServer, prompt, refreshDeepest]);

    const handleCut = useCallback(() => {
        if (!currentSelected || !currentSelectedPath) return;
        setClipboard({ file: currentSelected, action: 'cut', sourcePath: currentSelectedPath });
    }, [currentSelected, currentSelectedPath]);

    const handleCopy = useCallback(() => {
        if (!currentSelected || !currentSelectedPath) return;
        setClipboard({ file: currentSelected, action: 'copy', sourcePath: currentSelectedPath });
    }, [currentSelected, currentSelectedPath]);

    const pasteFromSystem = useCallback(async () => {
        if (!currentServer) return false;
        try {
            const consumed = await PasteFromClipboard(currentServer.id, currentPath);
            if (consumed && consumed.length > 0) {
                await refreshDeepest();
                return true;
            }
        } catch (err) {
            setError('Paste failed: ' + err);
            return true;
        }
        return false;
    }, [currentServer, currentPath, refreshDeepest]);

    const handlePaste = useCallback(async () => {
        if (!currentServer) return;
        if (clipboard) {
            try {
                const destName = clipboard.file.name;
                const dest = joinPath(currentPath, destName);
                if (clipboard.action === 'cut') {
                    if (dest === clipboard.sourcePath) return;
                    await MoveFile(currentServer.id, clipboard.sourcePath, dest);
                    setClipboard(null);
                } else {
                    let finalDest = dest;
                    if (dest === clipboard.sourcePath) {
                        const dot = destName.lastIndexOf('.');
                        finalDest =
                            dot > 0
                                ? joinPath(currentPath, `${destName.slice(0, dot)} (copy)${destName.slice(dot)}`)
                                : joinPath(currentPath, `${destName} (copy)`);
                    }
                    await CopyFile(currentServer.id, clipboard.sourcePath, finalDest);
                }
                await refreshDeepest();
                return;
            } catch (err) {
                setError('Paste failed: ' + err);
                return;
            }
        }
        await pasteFromSystem();
    }, [clipboard, currentServer, currentPath, refreshDeepest, pasteFromSystem]);

    const handleDownload = useCallback(async () => {
        if (!currentSelected || currentSelected.isDir || !currentSelectedPath) return;
        try {
            await DownloadFile(currentServer.id, currentSelectedPath, currentSelected.name);
        } catch (err) {
            setError('Download failed: ' + err);
        }
    }, [currentSelected, currentSelectedPath, currentServer]);

    const handleUpload = useCallback(async () => {
        if (!currentServer) return;
        try {
            await UploadFile(currentServer.id, currentPath);
            await refreshDeepest();
        } catch (err) {
            setError('Upload failed: ' + err);
        }
    }, [currentServer, currentPath, refreshDeepest]);

    const openServerForm = useCallback(async (initial) => {
        await custom(({ resolve }) => (
            <ServerForm
                initial={initial}
                onCancel={() => resolve(null)}
                onSave={async (data) => {
                    const saved = await SaveServer(data);
                    await loadServers();
                    resolve(saved);
                }}
            />
        ));
    }, [custom, loadServers]);

    // ---------- terminal ----------
    const openNewTerminal = useCallback(async () => {
        if (!currentServer) return;
        try {
            const id = await spawnTerminal(currentServer.id, currentPath || '');
            const labelDir = currentPath ? currentPath.split('/').filter(Boolean).pop() || '/' : '~';
            setTerminalTabs((prev) => [...prev, { id, label: `${currentServer.name} — ${labelDir}`, serverId: currentServer.id }]);
            setActiveTerminalId(id);
            setTerminalOpen(true);
        } catch (err) {
            setError('Failed to open terminal: ' + err);
        }
    }, [currentServer, currentPath]);

    const closeTerminalTab = useCallback(async (id, alreadyClosed = false) => {
        if (!alreadyClosed) {
            await destroyTerminal(id);
        }
        setTerminalTabs((prev) => {
            const next = prev.filter((t) => t.id !== id);
            if (activeTerminalId === id) {
                setActiveTerminalId(next.length > 0 ? next[next.length - 1].id : null);
                if (next.length === 0) setTerminalOpen(false);
            }
            return next;
        });
    }, [activeTerminalId]);

    const toggleTerminal = useCallback(async () => {
        if (terminalOpen) {
            setTerminalOpen(false);
            return;
        }
        if (terminalTabs.length === 0) {
            await openNewTerminal();
        } else {
            setTerminalOpen(true);
        }
    }, [terminalOpen, terminalTabs.length, openNewTerminal]);

    const handleDeleteServer = useCallback(async (server) => {
        const ok = await confirm({
            title: 'Remove server',
            message: `Remove "${server.name}" from the list? (Files on the server are not touched.)`,
            confirmLabel: 'Remove',
            danger: true,
        });
        if (!ok) return;
        try {
            await DeleteServer(server.id);
            if (currentServer?.id === server.id) {
                setCurrentServer(null);
                setColumns([]);
                setFocused(null);
            }
            await loadServers();
        } catch (err) {
            setError('Failed to delete server: ' + err);
        }
    }, [confirm, currentServer, loadServers]);

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e) => {
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (!currentServer) return;

            if (e.key === 'Backspace') { e.preventDefault(); goBack(); return; }
            if (e.key === 'F2') { e.preventDefault(); handleRename(); return; }
            if (e.key === 'Delete') { e.preventDefault(); handleDelete(); return; }
            if (e.key === 'Enter' && currentSelected) {
                e.preventDefault();
                handleActivate(focused.colIdx, currentSelected);
                return;
            }
            const k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'c') { e.preventDefault(); handleCopy(); return; }
            if ((e.ctrlKey || e.metaKey) && k === 'x') { e.preventDefault(); handleCut(); return; }
            if ((e.ctrlKey || e.metaKey) && k === 'v') { e.preventDefault(); handlePaste(); return; }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [currentServer, currentSelected, focused, goBack, handleRename, handleDelete, handleCopy, handleCut, handlePaste, handleActivate]);

    const onSortHeaderChange = (field) => {
        if (sortBy === field) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };

    return (
        <div className="flex h-screen bg-mac-chrome text-mac-text">
            {/* Sidebar */}
            <aside className="w-56 bg-mac-chrome border-r border-mac-divider flex flex-col pt-10">
                <SidebarSection
                    title="Locations"
                    action={
                        <button
                            onClick={() => openServerForm(null)}
                            className="text-mac-textSoft hover:text-mac-text w-5 h-5 rounded hover:bg-mac-hover flex items-center justify-center"
                            title="Add server"
                        >
                            <Plus size={12} />
                        </button>
                    }
                >
                    {servers.map((server) => {
                        const active = currentServer?.id === server.id;
                        return (
                            <div
                                key={server.id}
                                onClick={() => handleConnect(server)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setServerMenu({ x: e.clientX, y: e.clientY, server });
                                }}
                                className={`mx-2 px-2 py-1 rounded cursor-default flex items-center gap-2 ${
                                    active ? 'bg-mac-selection text-white' : 'hover:bg-mac-hover'
                                }`}
                            >
                                <ServerIcon size={14} className={active ? 'text-white' : 'text-mac-textSoft'} />
                                <span className="truncate text-[13px]">{server.name}</span>
                            </div>
                        );
                    })}
                    {servers.length === 0 && (
                        <div className="px-4 text-[11px] text-mac-textMuted italic">No servers. Click + to add.</div>
                    )}
                </SidebarSection>
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0 relative bg-white">
                {/* Toolbar */}
                <div className="h-11 flex items-center px-3 gap-1 bg-mac-chrome shadow-mac-toolbar">
                    <ToolButton onClick={goBack} disabled={!currentServer || (columns.length <= 1 && currentPath === '/')} title="Back (Backspace)">
                        <ChevronLeft size={16} />
                    </ToolButton>
                    <Separator />
                    <ToolButton onClick={handleUpload} disabled={!currentServer} title="Upload file">
                        <Upload size={15} />
                    </ToolButton>
                    <ToolButton onClick={handleCreateFolder} disabled={!currentServer} title="New folder">
                        <FolderPlus size={15} />
                    </ToolButton>
                    <ToolButton onClick={handlePaste} disabled={!currentServer && !clipboard} title="Paste (Ctrl+V)">
                        <Clipboard size={15} />
                    </ToolButton>
                    <Separator />

                    {/* View segmented control: Icons / List / Columns */}
                    <div className="flex items-center bg-mac-chromeAlt rounded-md overflow-hidden">
                        <SegmentButton active={view === 'icons'} onClick={() => handleViewChange('icons')} title="Icons view">
                            <Grid size={14} />
                        </SegmentButton>
                        <SegmentButton active={view === 'list'} onClick={() => handleViewChange('list')} title="List view">
                            <List size={14} />
                        </SegmentButton>
                        <SegmentButton active={view === 'columns'} onClick={() => handleViewChange('columns')} title="Columns view">
                            <ColumnsIcon />
                        </SegmentButton>
                    </div>

                    <div className="flex-1" />

                    <div className="flex items-center bg-white border border-mac-divider rounded px-2 py-1 w-48">
                        <Search size={12} className="text-mac-textSoft" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search"
                            className="ml-1 flex-1 text-[12px] bg-transparent placeholder:text-mac-textMuted"
                        />
                    </div>
                </div>

                {/* Path bar */}
                {currentServer && (
                    <div className="h-7 px-3 flex items-center gap-1 bg-mac-chrome border-t border-mac-divider text-[11px] text-mac-textSoft">
                        {breadcrumbs.map((c, i) => (
                            <React.Fragment key={c.path}>
                                {i > 0 && <span className="text-mac-textMuted">›</span>}
                                <button
                                    onClick={() => goToBreadcrumb(c.path)}
                                    className="hover:text-mac-text truncate max-w-[180px] flex items-center gap-1"
                                    title={c.path}
                                >
                                    {c.name === '/' ? <Home size={11} /> : c.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* File area */}
                <div
                    ref={fileAreaRef}
                    className={`flex-1 relative transition-colors ${
                        view === 'columns' ? 'overflow-hidden' : 'overflow-y-auto'
                    } ${view === 'icons' ? 'p-5' : 'p-0'} ${
                        dragOver ? 'bg-blue-50 ring-2 ring-mac-accent ring-inset' : ''
                    }`}
                    onContextMenu={(e) => view !== 'columns' && handleContextMenu(e, columns.length - 1, null)}
                    onClick={() => view !== 'columns' && setFocused(null)}
                >
                    {dragOver && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
                            <div className="bg-mac-accent text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
                                Drop to upload to {currentPath}
                            </div>
                        </div>
                    )}
                    {error ? (
                        <div className="m-4 p-3 text-red-600 bg-red-50 rounded-lg border border-red-100 text-[12px] whitespace-pre-wrap">{error}</div>
                    ) : !currentServer ? (
                        <div className="flex items-center justify-center h-full text-mac-textMuted text-[12px] italic">
                            Choose a server to begin.
                        </div>
                    ) : loading ? (
                        <div className="flex items-center justify-center h-full gap-2 text-mac-textMuted">
                            <div className="w-5 h-5 border-2 border-mac-divider border-t-mac-accent rounded-full animate-spin" />
                            <span className="text-[12px]">Connecting…</span>
                        </div>
                    ) : view === 'columns' ? (
                        <FileColumns
                            columns={renderedColumns}
                            focused={focused}
                            onSelect={handleSelect}
                            onActivate={handleActivate}
                            onItemContextMenu={(e, idx, file) => handleContextMenu(e, idx, file)}
                            onColumnContextMenu={(e, idx) => handleContextMenu(e, idx, null)}
                        />
                    ) : deepestColumn?.loading ? (
                        <div className="flex items-center justify-center h-full gap-2 text-mac-textMuted">
                            <div className="w-5 h-5 border-2 border-mac-divider border-t-mac-accent rounded-full animate-spin" />
                            <span className="text-[12px]">Loading…</span>
                        </div>
                    ) : visibleFiles.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-mac-textMuted text-[12px] italic">
                            {query ? 'No matches.' : 'Empty directory.'}
                        </div>
                    ) : view === 'icons' ? (
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 gap-x-2 gap-y-5">
                            {visibleFiles.map((file) => {
                                const fullPath = joinPath(currentPath, file.name);
                                const selected = currentSelectedPath === fullPath;
                                const cut = clipboard?.action === 'cut' && clipboard.sourcePath === fullPath;
                                return (
                                    <div
                                        key={file.name}
                                        onDoubleClick={() => handleActivate(columns.length - 1, file)}
                                        onClick={(e) => { e.stopPropagation(); handleSelect(columns.length - 1, file); }}
                                        onContextMenu={(e) => handleContextMenu(e, columns.length - 1, file)}
                                        title={`${file.name}\n${file.isDir ? 'Folder' : formatSize(file.size)}\n${formatDate(file.time)}`}
                                        className={`flex flex-col items-center p-1.5 rounded-md cursor-default ${cut ? 'opacity-50' : ''}`}
                                    >
                                        <div className={`p-1 rounded-md ${selected ? 'bg-mac-selectionSoft' : ''}`}>
                                            {file.isDir ? <FolderIcon size={56} /> : <FileIcon size={56} />}
                                        </div>
                                        <div
                                            className={`mt-1 text-[11.5px] text-center leading-tight break-all line-clamp-2 px-1.5 py-0.5 rounded ${
                                                selected ? 'bg-mac-selection text-white' : 'text-mac-text'
                                            }`}
                                        >
                                            {file.name}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <FileList
                            files={visibleFiles}
                            selectedFile={currentSelected}
                            onSelect={(file) => handleSelect(columns.length - 1, file)}
                            onActivate={(file) => handleActivate(columns.length - 1, file)}
                            onContextMenu={(e, file) => handleContextMenu(e, columns.length - 1, file)}
                            cutPath={clipboard?.action === 'cut' ? clipboard.file.name : null}
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSortChange={onSortHeaderChange}
                        />
                    )}
                </div>

                {/* Terminal panel */}
                {terminalOpen && (
                    <TerminalPanel
                        tabs={terminalTabs}
                        activeId={activeTerminalId}
                        onActivateTab={setActiveTerminalId}
                        onCloseTab={closeTerminalTab}
                        onAddTab={openNewTerminal}
                        onHide={() => setTerminalOpen(false)}
                        height={terminalHeight}
                    />
                )}

                {/* Status bar */}
                {currentServer && (
                    <div className="h-6 px-1 flex items-center justify-between bg-mac-chrome border-t border-mac-divider text-[11px] text-mac-textSoft">
                        <div className="flex items-center gap-1 pl-2">
                            <span>
                                {(deepestColumn?.files.length || 0)} item{deepestColumn?.files.length === 1 ? '' : 's'}
                                {query ? ` (showing ${visibleFiles.length})` : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {currentSelected && (
                                <span className="truncate">
                                    {currentSelected.name}
                                    {!currentSelected.isDir && ` · ${formatSize(currentSelected.size)}`}
                                    {` · ${formatDate(currentSelected.time)}`}
                                </span>
                            )}
                            <button
                                onClick={toggleTerminal}
                                title={terminalOpen ? 'Hide terminal' : 'Open terminal here'}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                                    terminalOpen
                                        ? 'bg-mac-selection text-white'
                                        : 'text-mac-textSoft hover:bg-mac-hover hover:text-mac-text'
                                }`}
                            >
                                <TerminalIcon size={12} />
                                {terminalTabs.length > 0 && (
                                    <span className="text-[10px] font-medium">{terminalTabs.length}</span>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {contextMenu && (
                    <ContextMenu x={contextMenu.x} y={contextMenu.y} side="left">
                        {contextMenu.file ? (
                            <>
                                <MenuItem onClick={() => { handleRename(); setContextMenu(null); }} hint="F2">Rename</MenuItem>
                                <MenuItem onClick={() => { handleCut(); setContextMenu(null); }} hint="Ctrl+X">Cut</MenuItem>
                                <MenuItem onClick={() => { handleCopy(); setContextMenu(null); }} hint="Ctrl+C">Copy</MenuItem>
                                <Divider />
                                {!contextMenu.file.isDir && (
                                    <MenuItem onClick={() => { handleDownload(); setContextMenu(null); }}>Download…</MenuItem>
                                )}
                                <MenuItem onClick={() => { handleDelete(); setContextMenu(null); }} hint="Del" danger>Move to Trash</MenuItem>
                            </>
                        ) : (
                            <>
                                <MenuItem onClick={() => { handleUpload(); setContextMenu(null); }} bold>Upload File…</MenuItem>
                                <MenuItem onClick={() => { handleCreateFolder(); setContextMenu(null); }}>New Folder</MenuItem>
                                <Divider />
                                <MenuItem onClick={() => { handlePaste(); setContextMenu(null); }} hint="Ctrl+V">Paste</MenuItem>
                                <Divider />
                                <MenuItem onClick={() => { refreshDeepest(); setContextMenu(null); }}>
                                    <span className="flex items-center gap-2"><Refresh size={11} /> Refresh</span>
                                </MenuItem>
                            </>
                        )}
                    </ContextMenu>
                )}

                {serverMenu && (
                    <ContextMenu x={serverMenu.x} y={serverMenu.y} side="right">
                        <MenuItem onClick={() => { openServerForm(serverMenu.server); setServerMenu(null); }}>Edit…</MenuItem>
                        <MenuItem onClick={() => { handleDeleteServer(serverMenu.server); setServerMenu(null); }} danger>Remove</MenuItem>
                    </ContextMenu>
                )}

                <TransferPanel />
            </div>
        </div>
    );
}

function ColumnsIcon() {
    return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="5" height="16" rx="0.6" />
            <rect x="9.5" y="4" width="5" height="16" rx="0.6" />
            <rect x="16" y="4" width="5" height="16" rx="0.6" />
        </svg>
    );
}

function SidebarSection({ title, action, children }) {
    return (
        <div className="mb-3">
            <div className="px-4 mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-mac-textMuted uppercase tracking-wider">{title}</span>
                {action}
            </div>
            <div>{children}</div>
        </div>
    );
}

function ToolButton({ children, onClick, disabled, title }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-mac-hover disabled:opacity-30 disabled:hover:bg-transparent text-mac-text"
        >
            {children}
        </button>
    );
}

function SegmentButton({ active, onClick, children, title }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`w-7 h-7 flex items-center justify-center transition-colors ${
                active ? 'bg-white shadow-sm text-mac-text' : 'text-mac-textSoft hover:text-mac-text'
            }`}
        >
            {children}
        </button>
    );
}

function Separator() {
    return <div className="w-px h-5 bg-mac-divider mx-1" />;
}

function ContextMenu({ x, y, side = 'left', children }) {
    const style = side === 'left' ? { top: y - 4, left: x - 220 } : { top: y, left: x };
    return (
        <div
            className="absolute bg-white/95 backdrop-blur-md border border-black/10 shadow-mac-card rounded-lg py-1 w-52 z-50 text-[12.5px]"
            style={style}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
}

function MenuItem({ children, onClick, hint, danger, bold, disabled }) {
    return (
        <div
            onClick={disabled ? undefined : onClick}
            className={`px-3 py-1 mx-1 rounded flex justify-between items-center ${
                disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : danger
                        ? 'hover:bg-red-500 hover:text-white cursor-default'
                        : 'hover:bg-mac-selection hover:text-white cursor-default'
            } ${bold ? 'font-medium' : ''}`}
        >
            <span>{children}</span>
            {hint && <span className="opacity-50 text-[10.5px] ml-2">{hint}</span>}
        </div>
    );
}

function Divider() {
    return <div className="border-t border-black/10 my-1 mx-2" />;
}

export default App;
