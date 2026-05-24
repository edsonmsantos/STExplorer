import React, { useEffect, useState } from 'react';
import { HasSecret } from '../../wailsjs/go/main/App';

const empty = {
    id: '',
    name: '',
    host: '',
    port: 22,
    user: '',
    password: '',
    privateKeyPath: '',
    passphrase: '',
    highThroughput: true,
};

export default function ServerForm({ initial, onSave, onCancel }) {
    const [data, setData] = useState({ ...empty, ...(initial || {}) });
    const [authMode, setAuthMode] = useState(initial?.privateKeyPath ? 'key' : 'password');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    // Whether the stored record has a saved password / passphrase. Used to
    // tell the user the field can be left blank to keep the current secret.
    const [hasSecret, setHasSecret] = useState({ password: false, passphrase: false });

    useEffect(() => {
        if (!initial?.id) return;
        HasSecret(initial.id)
            .then((r) => setHasSecret({ password: !!r?.password, passphrase: !!r?.passphrase }))
            .catch(() => {});
    }, [initial?.id]);

    const set = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (!data.name.trim() || !data.host.trim() || !data.user.trim()) {
            setError('Name, host and user are required.');
            return;
        }
        if (authMode === 'password' && !data.password && !hasSecret.password) {
            setError('Password is required.');
            return;
        }
        if (authMode === 'key' && !data.privateKeyPath.trim()) {
            setError('Private key path is required.');
            return;
        }
        const payload = {
            ...data,
            port: Number(data.port) || 22,
            password: authMode === 'password' ? data.password : '',
            privateKeyPath: authMode === 'key' ? data.privateKeyPath : '',
            passphrase: authMode === 'key' ? data.passphrase : '',
            highThroughput: !!data.highThroughput,
        };
        try {
            setSaving(true);
            await onSave(payload);
        } catch (err) {
            setError(String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="bg-white rounded-xl shadow-2xl w-[480px] p-5 border border-gray-200">
            <h2 className="text-base font-semibold mb-3">
                {initial?.id ? 'Edit server' : 'Add server'}
            </h2>

            <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Name" value={data.name} onChange={set('name')} colSpan={2} />
                <Field label="Host" value={data.host} onChange={set('host')} />
                <Field label="Port" type="number" value={data.port} onChange={set('port')} />
                <Field label="User" value={data.user} onChange={set('user')} colSpan={2} />
            </div>

            <div className="mt-4 mb-2 text-sm flex items-center gap-3">
                <span className="font-medium text-gray-700">Auth:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="radio"
                        checked={authMode === 'password'}
                        onChange={() => setAuthMode('password')}
                    />
                    Password
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="radio"
                        checked={authMode === 'key'}
                        onChange={() => setAuthMode('key')}
                    />
                    SSH key
                </label>
            </div>

            {authMode === 'password' ? (
                <Field
                    label="Password"
                    type="password"
                    value={data.password}
                    onChange={set('password')}
                    placeholder={hasSecret.password ? '(saved — leave blank to keep)' : ''}
                />
            ) : (
                <>
                    <Field
                        label="Private key path"
                        value={data.privateKeyPath}
                        onChange={set('privateKeyPath')}
                        placeholder="C:\\Users\\you\\.ssh\\id_ed25519"
                    />
                    <Field
                        label="Passphrase (optional)"
                        type="password"
                        value={data.passphrase}
                        onChange={set('passphrase')}
                        placeholder={hasSecret.passphrase ? '(saved — leave blank to keep)' : ''}
                    />
                </>
            )}

            <label className="mt-4 flex items-start gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={data.highThroughput !== false}
                    onChange={(e) => setData((d) => ({ ...d, highThroughput: e.target.checked }))}
                    className="mt-0.5"
                />
                <span className="text-xs text-gray-700">
                    Use large SFTP packets (256 KB) for faster transfers.
                    <span className="block text-mac-textMuted mt-0.5">
                        Recommended for standard OpenSSH servers. Disables itself automatically
                        if the server can't handle large packets (e.g. Hetzner Storage Box).
                    </span>
                </span>
            </label>

            {error && (
                <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 text-sm rounded bg-mac-accent text-white hover:bg-mac-accentHover disabled:opacity-60"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </form>
    );
}

function Field({ label, type = 'text', value, onChange, placeholder, colSpan = 1 }) {
    return (
        <label className={`block ${colSpan === 2 ? 'col-span-2' : ''}`}>
            <span className="text-xs text-gray-600">{label}</span>
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="mt-0.5 w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-mac-accent"
            />
        </label>
    );
}
