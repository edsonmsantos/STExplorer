import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { EventsOn, EventsOff } from '../../wailsjs/runtime';
import {
    OpenTerminal,
    CloseTerminal,
    SendTerminalInput,
    ResizeTerminal,
} from '../../wailsjs/go/main/App';
import { Plus, Close, TerminalIcon } from './Icons';

const THEME = {
    background: '#1B1B1F',
    foreground: '#E4E4E7',
    cursor: '#E4E4E7',
    cursorAccent: '#1B1B1F',
    selectionBackground: '#3B82F680',
    black: '#1B1B1F',
    red: '#FF5C57',
    green: '#5AF78E',
    yellow: '#F3F99D',
    blue: '#57C7FF',
    magenta: '#FF6AC1',
    cyan: '#9AEDFE',
    white: '#F1F1F0',
    brightBlack: '#686868',
    brightRed: '#FF5C57',
    brightGreen: '#5AF78E',
    brightYellow: '#F3F99D',
    brightBlue: '#57C7FF',
    brightMagenta: '#FF6AC1',
    brightCyan: '#9AEDFE',
    brightWhite: '#FFFFFF',
};

export default function TerminalPanel({
    tabs,
    activeId,
    onActivateTab,
    onCloseTab,
    onAddTab,
    onHide,
    height = 280,
}) {
    return (
        <div
            className="flex flex-col bg-[#1B1B1F] border-t border-mac-divider text-white"
            style={{ height }}
        >
            {/* Tab strip */}
            <div className="h-8 flex items-center bg-[#2A2A2E] border-b border-black/40 select-none">
                <div className="flex items-center overflow-x-auto flex-1">
                    {tabs.map((t) => (
                        <TabChip
                            key={t.id}
                            tab={t}
                            active={t.id === activeId}
                            onActivate={() => onActivateTab(t.id)}
                            onClose={() => onCloseTab(t.id)}
                        />
                    ))}
                    <button
                        onClick={onAddTab}
                        title="New terminal"
                        className="ml-1 h-6 w-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded"
                    >
                        <Plus size={12} />
                    </button>
                </div>
                <button
                    onClick={onHide}
                    title="Hide terminal"
                    className="mr-1 h-6 w-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded"
                >
                    <Close size={12} />
                </button>
            </div>

            {/* Terminals (only the active one is visible) */}
            <div className="flex-1 relative">
                {tabs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-white/50 text-[12px] gap-2">
                        <TerminalIcon size={14} />
                        Click + to open a new terminal.
                    </div>
                ) : (
                    tabs.map((t) => (
                        <TerminalInstance
                            key={t.id}
                            tab={t}
                            visible={t.id === activeId}
                            onClosedByServer={() => onCloseTab(t.id, true)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function TabChip({ tab, active, onActivate, onClose }) {
    return (
        <div
            onClick={onActivate}
            className={`flex items-center gap-1.5 h-8 pl-3 pr-1 cursor-default border-r border-black/40 text-[12px] ${
                active ? 'bg-[#1B1B1F] text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5'
            }`}
        >
            <TerminalIcon size={11} className="opacity-60" />
            <span className="truncate max-w-[160px]">{tab.label}</span>
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="w-4 h-4 ml-1 flex items-center justify-center rounded hover:bg-white/15 text-white/60 hover:text-white"
                title="Close"
            >
                <Close size={9} />
            </button>
        </div>
    );
}

function TerminalInstance({ tab, visible, onClosedByServer }) {
    const containerRef = useRef(null);
    const termRef = useRef(null);
    const fitRef = useRef(null);

    // Create the xterm once per tab id.
    useEffect(() => {
        const term = new Terminal({
            fontSize: 12,
            fontFamily: '"SF Mono", Menlo, Monaco, "Cascadia Code", Consolas, "Courier New", monospace',
            theme: THEME,
            cursorBlink: true,
            allowProposedApi: true,
            scrollback: 5000,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current);

        // Initial fit (deferred so the DOM has measured the container).
        requestAnimationFrame(() => {
            try {
                fit.fit();
                ResizeTerminal(tab.id, term.cols, term.rows).catch(() => {});
            } catch (_) {}
        });

        const offData = EventsOn('terminal:data', (id, b64) => {
            if (id !== tab.id) return;
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            term.write(bytes);
        });
        const offClose = EventsOn('terminal:close', (id) => {
            if (id === tab.id) onClosedByServer();
        });

        // Ctrl+Shift+C / Ctrl+Shift+V for copy/paste (matches GNOME Terminal,
        // konsole, and other Linux terminal conventions). Plain Ctrl+C is left
        // alone so it can still send SIGINT to the running process.
        term.attachCustomKeyEventHandler((e) => {
            if (e.type !== 'keydown') return true;
            const k = (e.key || '').toLowerCase();

            if (e.ctrlKey && e.shiftKey && k === 'c') {
                const sel = term.getSelection();
                if (sel) {
                    navigator.clipboard.writeText(sel).catch(() => {});
                }
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            if (e.ctrlKey && e.shiftKey && k === 'v') {
                navigator.clipboard
                    .readText()
                    .then((text) => {
                        if (text) SendTerminalInput(tab.id, text).catch(() => {});
                    })
                    .catch(() => {});
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            return true;
        });

        term.onData((data) => {
            SendTerminalInput(tab.id, data).catch(() => {});
        });

        termRef.current = term;
        fitRef.current = fit;

        // Resize on window resize while this tab is visible.
        const onResize = () => {
            if (!fitRef.current || !termRef.current) return;
            try {
                fitRef.current.fit();
                ResizeTerminal(tab.id, termRef.current.cols, termRef.current.rows).catch(() => {});
            } catch (_) {}
        };
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            offData();
            offClose();
            term.dispose();
            termRef.current = null;
            fitRef.current = null;
        };
    }, [tab.id]);

    // When the tab becomes visible (active), refit and focus.
    useEffect(() => {
        if (!visible) return;
        const id = requestAnimationFrame(() => {
            try {
                fitRef.current?.fit();
                if (termRef.current) {
                    ResizeTerminal(tab.id, termRef.current.cols, termRef.current.rows).catch(() => {});
                    termRef.current.focus();
                }
            } catch (_) {}
        });
        return () => cancelAnimationFrame(id);
    }, [visible, tab.id]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 p-1"
            style={{ display: visible ? 'block' : 'none' }}
        />
    );
}

// Hook-like helper kept here so App.jsx doesn't need to know terminal lifecycle details.
export async function spawnTerminal(serverID, dir) {
    // Reasonable defaults; xterm will resize once mounted.
    const id = await OpenTerminal(serverID, dir, 100, 30);
    return id;
}

export async function destroyTerminal(id) {
    try {
        await CloseTerminal(id);
    } catch (_) {}
}
