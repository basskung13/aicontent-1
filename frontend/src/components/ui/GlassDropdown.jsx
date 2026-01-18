import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { twMerge } from 'tailwind-merge';
import { Plus } from 'lucide-react';

export default function GlassDropdown({
    value,
    onChange,
    options,
    placeholder = '',
    buttonClassName = '',
    menuClassName = '',
    optionClassName = '',
    disabled = false,
    minWidth = 256,
    onAddNew = null,
    addNewPlaceholder = 'เพิ่มรายการใหม่...'
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const [newItemValue, setNewItemValue] = useState('');
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const inputRef = useRef(null);

    const selectedOption = useMemo(
        () => options.find((opt) => opt.value === value),
        [options, value]
    );

    const handleAddNew = () => {
        if (newItemValue.trim() && onAddNew) {
            onAddNew(newItemValue.trim());
            setNewItemValue('');
        }
    };

    const updatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setPosition({
            top: rect.bottom + 8,
            left: rect.left,
            width: rect.width
        });
    }, []);

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (event) => {
            if (!menuRef.current || !buttonRef.current) return;
            if (!menuRef.current.contains(event.target) && !buttonRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [open, updatePosition]);

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    updatePosition();
                    setOpen((prev) => !prev);
                }}
                className={twMerge(buttonClassName, disabled && 'opacity-50 cursor-not-allowed')}
            >
                {selectedOption?.label ?? placeholder}
            </button>

            {open && createPortal(
                <div
                    ref={menuRef}
                    className={twMerge(
                        'fixed bg-gradient-to-b from-slate-800/90 to-slate-900/95 backdrop-blur-[28px] border border-white/15 rounded-2xl shadow-[0_32px_100px_rgba(0,0,0,0.95)] ring-1 ring-white/10 z-[999999] overflow-hidden',
                        menuClassName
                    )}
                    style={{
                        top: position.top,
                        left: position.left,
                        width: Math.max(minWidth, position.width)
                    }}
                >
                    <div className="max-h-64 overflow-y-auto">
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                disabled={opt.disabled}
                                onClick={() => {
                                    if (opt.disabled) return;
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={twMerge(
                                    'w-full flex items-center gap-3 px-3 py-2 text-left leading-tight hover:bg-white/10 transition-colors',
                                    value === opt.value ? 'bg-yellow-500/20 text-yellow-300 font-bold' : 'text-white',
                                    opt.disabled && 'opacity-50 cursor-not-allowed',
                                    optionClassName
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {onAddNew && (
                        <div className="border-t border-white/10 p-1.5">
                            <div className="flex gap-1">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={newItemValue}
                                    onChange={(e) => setNewItemValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNew()}
                                    placeholder={addNewPlaceholder}
                                    className="flex-1 min-w-0 px-2 py-1 bg-black/40 border border-white/10 rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-green-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddNew}
                                    disabled={!newItemValue.trim()}
                                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
