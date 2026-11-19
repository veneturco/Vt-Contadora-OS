import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps {
  dialog: ConfirmDialogState | null;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ dialog, onClose }) => {
  useEffect(() => {
    if (!dialog) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dialog, onClose]);

  if (!dialog) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vt-confirm-title"
      onClick={onClose}
    >
      <div
        className="ui-card w-full max-w-md p-5 space-y-4 border border-[var(--border-highlight)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                dialog.destructive
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                  : 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id="vt-confirm-title" className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              {dialog.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-secondary)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{dialog.message}</p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-secondary text-xs py-2 px-3.5"
          >
            {dialog.cancelLabel || 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={async () => {
              const fn = dialog.onConfirm;
              onClose();
              await fn();
            }}
            className={`text-xs font-semibold py-2 px-4 rounded-[var(--radius-control)] transition active:scale-[0.98] ${
              dialog.destructive
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
                : 'ui-btn-primary'
            }`}
          >
            {dialog.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};
