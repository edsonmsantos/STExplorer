import React, { useEffect, useRef } from 'react';
import { FolderIcon, FileIcon, ChevronRight } from './Icons';

export default function FileColumns({
    columns,
    focused,
    onSelect,
    onActivate,
    onItemContextMenu,
    onColumnContextMenu,
}) {
    const scrollerRef = useRef(null);

    // Auto-scroll horizontally so the deepest column is visible whenever a new
    // column is added.
    useEffect(() => {
        const el = scrollerRef.current;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [columns.length]);

    return (
        <div ref={scrollerRef} className="absolute inset-0 overflow-x-auto overflow-y-hidden bg-white">
            <div className="flex h-full min-w-full">
                {columns.map((col, i) => (
                    <Column
                        key={`${i}-${col.path}`}
                        column={col}
                        colIndex={i}
                        focused={focused}
                        onSelect={onSelect}
                        onActivate={onActivate}
                        onItemContextMenu={onItemContextMenu}
                        onColumnContextMenu={onColumnContextMenu}
                    />
                ))}
                {/* Filler so empty space to the right has the same bg */}
                <div className="flex-1 bg-white" />
            </div>
        </div>
    );
}

function Column({ column, colIndex, focused, onSelect, onActivate, onItemContextMenu, onColumnContextMenu }) {
    const isFocusedCol = focused?.colIdx === colIndex;

    return (
        <div
            className="w-56 h-full border-r border-mac-divider overflow-y-auto bg-white shrink-0 py-1 relative"
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onColumnContextMenu(e, colIndex);
            }}
        >
            {column.loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mac-textMuted">
                    <div className="w-5 h-5 border-2 border-mac-divider border-t-mac-accent rounded-full animate-spin" />
                    <span className="text-[11px]">Loading…</span>
                </div>
            ) : column.files.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-mac-textMuted italic">Empty</div>
            ) : (
                column.files.map((file) => {
                    const isFocused = isFocusedCol && focused?.name === file.name;
                    const isTrail = !isFocused && column.expandedName === file.name;
                    return (
                        <div
                            key={file.name}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(colIndex, file);
                            }}
                            onDoubleClick={() => onActivate(colIndex, file)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onItemContextMenu(e, colIndex, file);
                            }}
                            className={`flex items-center gap-1.5 mx-1 px-1.5 py-[3px] rounded cursor-default text-[12px] ${
                                isFocused
                                    ? 'bg-mac-selection text-white'
                                    : isTrail
                                        ? 'bg-mac-selectionInactive text-mac-text'
                                        : 'hover:bg-mac-hover text-mac-text'
                            }`}
                        >
                            {file.isDir ? <FolderIcon size={14} /> : <FileIcon size={12} />}
                            <span className="truncate flex-1">{file.name}</span>
                            {file.isDir && (
                                <ChevronRight
                                    size={10}
                                    className={isFocused ? 'opacity-90' : 'opacity-40'}
                                />
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
