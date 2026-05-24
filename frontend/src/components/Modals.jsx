import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ModalContext = createContext(null);

export function useModals() {
    const ctx = useContext(ModalContext);
    if (!ctx) throw new Error('useModals must be used inside <ModalProvider>');
    return ctx;
}

export function ModalProvider({ children }) {
    const [modal, setModal] = useState(null); // { type, props, resolve }

    const close = useCallback((value) => {
        setModal((m) => {
            if (m) m.resolve(value);
            return null;
        });
    }, []);

    const prompt = useCallback((opts) => {
        return new Promise((resolve) => {
            setModal({ type: 'prompt', props: opts || {}, resolve });
        });
    }, []);

    const confirm = useCallback((opts) => {
        return new Promise((resolve) => {
            setModal({ type: 'confirm', props: opts || {}, resolve });
        });
    }, []);

    const custom = useCallback((render) => {
        return new Promise((resolve) => {
            setModal({ type: 'custom', props: { render }, resolve });
        });
    }, []);

    return (
        <ModalContext.Provider value={{ prompt, confirm, custom, close }}>
            {children}
            {modal && (
                <Backdrop onClose={() => close(null)}>
                    {modal.type === 'prompt' && (
                        <PromptModal {...modal.props} onResolve={close} />
                    )}
                    {modal.type === 'confirm' && (
                        <ConfirmModal {...modal.props} onResolve={close} />
                    )}
                    {modal.type === 'custom' && modal.props.render({ resolve: close })}
                </Backdrop>
            )}
        </ModalContext.Provider>
    );
}

function Backdrop({ children, onClose }) {
    return (
        <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[100]"
            onClick={onClose}
        >
            <div onClick={(e) => e.stopPropagation()}>{children}</div>
        </div>
    );
}

function PromptModal({ title, message, placeholder, defaultValue = '', confirmLabel = 'OK', cancelLabel = 'Cancel', onResolve }) {
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef(null);
    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const submit = (e) => {
        e?.preventDefault?.();
        onResolve(value);
    };

    return (
        <form
            onSubmit={submit}
            className="bg-white rounded-xl shadow-2xl w-[420px] p-5 border border-gray-200"
        >
            {title && <h2 className="text-base font-semibold mb-2">{title}</h2>}
            {message && <p className="text-sm text-gray-600 mb-3">{message}</p>}
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                onKeyDown={(e) => { if (e.key === 'Escape') onResolve(null); }}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-mac-accent"
            />
            <div className="flex justify-end gap-2 mt-4">
                <button
                    type="button"
                    onClick={() => onResolve(null)}
                    className="px-4 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                >
                    {cancelLabel}
                </button>
                <button
                    type="submit"
                    className="px-4 py-1.5 text-sm rounded bg-mac-accent text-white hover:bg-mac-accentHover"
                >
                    {confirmLabel}
                </button>
            </div>
        </form>
    );
}

function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onResolve }) {
    return (
        <div className="bg-white rounded-xl shadow-2xl w-[420px] p-5 border border-gray-200">
            {title && <h2 className="text-base font-semibold mb-2">{title}</h2>}
            {message && <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{message}</p>}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={() => onResolve(false)}
                    className="px-4 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    autoFocus
                    onClick={() => onResolve(true)}
                    className={`px-4 py-1.5 text-sm rounded text-white ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-mac-accent hover:bg-mac-accentHover'}`}
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
    );
}
