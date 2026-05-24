import React from 'react';

// Finder-style folder: two layers with a tab on the back panel.
export function FolderIcon({ size = 48, className = '' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 56" className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="folderBack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B8D2F2" />
                    <stop offset="100%" stopColor="#94B8E8" />
                </linearGradient>
                <linearGradient id="folderFront" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8AB4EE" />
                    <stop offset="100%" stopColor="#5D8FD8" />
                </linearGradient>
            </defs>
            <path
                d="M5,10 L22,10 L27,6 L57,6 C59.2,6 61,7.8 61,10 L61,46 C61,48.2 59.2,50 57,50 L5,50 C2.8,50 1,48.2 1,46 L1,14 C1,11.8 2.8,10 5,10 Z"
                fill="url(#folderBack)"
            />
            <path
                d="M3,18 L59,18 C60.1,18 61,18.9 61,20 L61,46 C61,48.2 59.2,50 57,50 L5,50 C2.8,50 1,48.2 1,46 L1,20 C1,18.9 1.9,18 3,18 Z"
                fill="url(#folderFront)"
            />
            <path
                d="M1,20 L61,20 L61,21 L1,21 Z"
                fill="rgba(255,255,255,0.25)"
            />
        </svg>
    );
}

// Generic file: page with folded corner.
export function FileIcon({ size = 48, className = '' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 52 64" className={className} xmlns="http://www.w3.org/2000/svg">
            <path
                d="M6,2 L34,2 L50,18 L50,58 C50,60.2 48.2,62 46,62 L6,62 C3.8,62 2,60.2 2,58 L2,6 C2,3.8 3.8,2 6,2 Z"
                fill="#FFFFFF"
                stroke="#C7C7CC"
                strokeWidth="1.2"
            />
            <path
                d="M34,2 L50,18 L37,18 C35.3,18 34,16.7 34,15 Z"
                fill="#E5E5EA"
                stroke="#C7C7CC"
                strokeWidth="1.2"
                strokeLinejoin="round"
            />
            <rect x="10" y="30" width="32" height="1.6" fill="#D1D1D6" rx="0.8" />
            <rect x="10" y="36" width="32" height="1.6" fill="#D1D1D6" rx="0.8" />
            <rect x="10" y="42" width="22" height="1.6" fill="#D1D1D6" rx="0.8" />
        </svg>
    );
}

// Inline toolbar icons (stroke = currentColor so they inherit color).
const Svg = ({ children, size = 16, viewBox = '0 0 24 24', className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox={viewBox}
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
    >
        {children}
    </svg>
);

export const ChevronLeft = (p) => <Svg {...p}><polyline points="15 18 9 12 15 6" /></Svg>;
export const ChevronRight = (p) => <Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>;
export const ChevronUp = (p) => <Svg {...p}><polyline points="6 15 12 9 18 15" /></Svg>;
export const ChevronDown = (p) => <Svg {...p}><polyline points="6 9 12 15 18 9" /></Svg>;
export const Upload = (p) => (
    <Svg {...p}>
        <path d="M12 16V4" />
        <polyline points="7 9 12 4 17 9" />
        <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </Svg>
);
export const Download = (p) => (
    <Svg {...p}>
        <path d="M12 4v12" />
        <polyline points="7 11 12 16 17 11" />
        <path d="M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
    </Svg>
);
export const FolderPlus = (p) => (
    <Svg {...p}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <path d="M12 12v4" />
        <path d="M10 14h4" />
    </Svg>
);
export const Clipboard = (p) => (
    <Svg {...p}>
        <rect x="8" y="3" width="8" height="4" rx="1" />
        <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </Svg>
);
export const Search = (p) => (
    <Svg {...p}>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-3.5-3.5" />
    </Svg>
);
export const Grid = (p) => (
    <Svg {...p}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
);
export const List = (p) => (
    <Svg {...p}>
        <line x1="8" y1="6" x2="20" y2="6" />
        <line x1="8" y1="12" x2="20" y2="12" />
        <line x1="8" y1="18" x2="20" y2="18" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
    </Svg>
);
export const Plus = (p) => <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
export const Refresh = (p) => (
    <Svg {...p}>
        <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
        <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
        <polyline points="21 3 21 8 16 8" />
        <polyline points="3 21 3 16 8 16" />
    </Svg>
);
export const Trash = (p) => (
    <Svg {...p}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
);
export const ServerIcon = (p) => (
    <Svg {...p}>
        <rect x="3" y="4" width="18" height="6" rx="1" />
        <rect x="3" y="14" width="18" height="6" rx="1" />
        <circle cx="7" cy="7" r="0.6" fill="currentColor" />
        <circle cx="7" cy="17" r="0.6" fill="currentColor" />
    </Svg>
);
export const Home = (p) => (
    <Svg {...p}>
        <path d="m3 11 9-7 9 7" />
        <path d="M5 10v10h14V10" />
    </Svg>
);
export const TerminalIcon = (p) => (
    <Svg {...p}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <polyline points="7 9 10 12 7 15" />
        <line x1="12" y1="15" x2="16" y2="15" />
    </Svg>
);
export const Close = (p) => (
    <Svg {...p}>
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="6" y1="18" x2="18" y2="6" />
    </Svg>
);
