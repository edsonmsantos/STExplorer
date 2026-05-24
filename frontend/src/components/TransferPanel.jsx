import React, { useEffect, useState } from 'react';
import { EventsOn, EventsOff } from '../../wailsjs/runtime';

const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const ICONS = { upload: '⬆', download: '⬇', copy: '⎘' };

export default function TransferPanel() {
    const [transfers, setTransfers] = useState({}); // id -> event
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        const handler = (ev) => {
            setTransfers((prev) => {
                const next = { ...prev };
                if (ev.done && !ev.error) {
                    // Keep finished transfers visible for 2s.
                    next[ev.id] = { ...ev };
                    setTimeout(() => {
                        setTransfers((p) => {
                            const c = { ...p };
                            delete c[ev.id];
                            return c;
                        });
                    }, 2000);
                } else {
                    next[ev.id] = { ...ev };
                }
                return next;
            });
        };
        EventsOn('transfer:progress', handler);
        return () => EventsOff('transfer:progress');
    }, []);

    const items = Object.values(transfers);
    if (items.length === 0) return null;

    const active = items.filter((i) => !i.done);

    return (
        <div className="fixed bottom-3 right-3 w-[320px] bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-2xl text-[12px] z-50">
            <div
                className="flex items-center justify-between px-3 py-2 border-b border-gray-100 cursor-pointer"
                onClick={() => setCollapsed((c) => !c)}
            >
                <span className="font-semibold text-gray-700">
                    Transfers {active.length > 0 && `(${active.length})`}
                </span>
                <span className="text-gray-400">{collapsed ? '▴' : '▾'}</span>
            </div>
            {!collapsed && (
                <div className="max-h-64 overflow-y-auto">
                    {items.map((t) => {
                        const pct = t.total > 0 ? Math.min(100, (t.bytes / t.total) * 100) : 0;
                        return (
                            <div key={t.id} className="px-3 py-2 border-b border-gray-50 last:border-b-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate">
                                        <span className="mr-1.5">{ICONS[t.direction] || '•'}</span>
                                        {t.fileName}
                                    </span>
                                    <span className="text-gray-400 text-[10px] shrink-0">
                                        {t.error ? 'Error' : t.done ? 'Done' : `${pct.toFixed(0)}%`}
                                    </span>
                                </div>
                                {!t.error && (
                                    <div className="h-1 bg-gray-100 rounded mt-1 overflow-hidden">
                                        <div
                                            className={`h-full ${t.done ? 'bg-green-500' : 'bg-mac-accent'}`}
                                            style={{ width: `${t.done ? 100 : pct}%` }}
                                        />
                                    </div>
                                )}
                                {t.error && (
                                    <div className="text-red-500 text-[10px] truncate" title={t.error}>
                                        {t.error}
                                    </div>
                                )}
                                {!t.done && t.total > 0 && (
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        {formatSize(t.bytes)} / {formatSize(t.total)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
