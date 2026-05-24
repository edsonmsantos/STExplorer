import React from 'react';
import { FolderIcon, FileIcon, ChevronUp, ChevronDown } from './Icons';

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

const kindOf = (file) => {
    if (file.isDir) return 'Folder';
    const dot = file.name.lastIndexOf('.');
    if (dot < 0) return 'File';
    return file.name.slice(dot + 1).toUpperCase() + ' document';
};

function SortHeader({ label, field, sortBy, sortDir, onChange, align = 'left', width }) {
    const active = sortBy === field;
    return (
        <button
            onClick={() => onChange(field)}
            className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-mac-textSoft hover:text-mac-text ${
                align === 'right' ? 'justify-end' : ''
            }`}
            style={width ? { width } : undefined}
        >
            <span>{label}</span>
            {active && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </button>
    );
}

export default function FileList({
    files,
    selectedFile,
    onSelect,
    onActivate,
    onContextMenu,
    cutPath,
    sortBy,
    sortDir,
    onSortChange,
}) {
    return (
        <div className="text-[12px] text-mac-text">
            <div className="sticky top-0 z-10 grid grid-cols-[1fr_180px_100px_140px] bg-mac-chromeAlt border-b border-mac-divider">
                <SortHeader label="Name" field="name" sortBy={sortBy} sortDir={sortDir} onChange={onSortChange} />
                <SortHeader label="Date Modified" field="time" sortBy={sortBy} sortDir={sortDir} onChange={onSortChange} />
                <SortHeader label="Size" field="size" sortBy={sortBy} sortDir={sortDir} onChange={onSortChange} align="right" />
                <div className="px-3 py-1.5 text-[11px] font-medium text-mac-textSoft">Kind</div>
            </div>

            {files.map((file, idx) => {
                const selected = selectedFile?.name === file.name;
                const cut = cutPath && file.name === cutPath;
                return (
                    <div
                        key={file.name}
                        onClick={(e) => { e.stopPropagation(); onSelect(file); }}
                        onDoubleClick={() => onActivate(file)}
                        onContextMenu={(e) => onContextMenu(e, file)}
                        className={`grid grid-cols-[1fr_180px_100px_140px] items-center cursor-default ${
                            selected ? 'bg-mac-selection text-white' : idx % 2 === 1 ? 'bg-mac-listAlt' : ''
                        } ${cut ? 'opacity-50' : ''}`}
                    >
                        <div className="flex items-center gap-2 px-3 py-1 min-w-0">
                            {file.isDir
                                ? <FolderIcon size={18} className="shrink-0" />
                                : <FileIcon size={16} className="shrink-0" />}
                            <span className="truncate">{file.name}</span>
                        </div>
                        <div className={`px-3 py-1 truncate ${selected ? 'text-white/80' : 'text-mac-textSoft'}`}>
                            {formatDate(file.time)}
                        </div>
                        <div className={`px-3 py-1 text-right ${selected ? 'text-white/80' : 'text-mac-textSoft'}`}>
                            {file.isDir ? '--' : formatSize(file.size)}
                        </div>
                        <div className={`px-3 py-1 truncate ${selected ? 'text-white/80' : 'text-mac-textSoft'}`}>
                            {kindOf(file)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
