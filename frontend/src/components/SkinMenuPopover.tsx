import React, { useState, useEffect, useRef } from 'react';
import { Layers, Check } from 'lucide-react';
import { SkinId } from '../types/fiscal';
import { SKINS } from '../data/initialCatalogs';

interface SkinMenuPopoverProps {
  skin: SkinId;
  onSelectSkin: (next: SkinId) => void;
}

const SWATCH_COLORS: Record<SkinId, { bg: string; accent: string }> = {
  'obsidian-champagne': { bg: '#07080A', accent: '#D8B778' },
  'swiss-ivory': { bg: '#F3F1EC', accent: '#9A7432' },
  'apple-craft-pro': { bg: '#000000', accent: '#0A84FF' },
  'obsidian-linear': { bg: '#08090A', accent: '#5E6AD2' },
  'mercury-sovereign': { bg: '#070B14', accent: '#38BDF8' },
  'editorial-swiss': { bg: '#F2F2F7', accent: '#0066CC' },
  'eink-auditor': { bg: '#F8F7F4', accent: '#18181B' },
  'spatial-titanium': { bg: '#121316', accent: '#64D2FF' },
  'tactile-bento': { bg: '#0F0F10', accent: '#F59E0B' },
  'hyperframe-tactical': { bg: '#05080A', accent: '#10B981' },
  'kinetic-studio': { bg: '#0D0B14', accent: '#A78BFA' },
  'neo-brutal': { bg: '#000000', accent: '#FACC15' }
};

export const SkinMenuPopover: React.FC<SkinMenuPopoverProps> = ({ skin, onSelectSkin }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Cambiar apariencia y tema"
        aria-expanded={open}
        title="Apariencia / Tema (Ctrl+K)"
        className="p-1.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-[var(--border-highlight)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
      >
        <Layers className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="ui-card absolute right-0 mt-2 w-64 p-2 z-50 shadow-2xl border border-[var(--border-highlight)] space-y-2"
        >
          <div className="px-2 pt-1 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Apariencia
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">Ctrl+K</span>
          </div>

          {/* Acceso rápido: Private Wealth Oscuro / Claro */}
          <div className="grid grid-cols-2 gap-1.5 px-1">
            {(['obsidian-champagne', 'swiss-ivory'] as SkinId[]).map(id => {
              const active = skin === id;
              const sw = SWATCH_COLORS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelectSkin(id);
                    setOpen(false);
                  }}
                  className="px-2.5 py-2 rounded-lg border text-left transition flex items-center gap-2 text-xs font-medium"
                  style={{
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                    style={{ background: `linear-gradient(135deg, ${sw.bg} 55%, ${sw.accent} 55%)` }}
                  />
                  <span className="truncate">{id === 'obsidian-champagne' ? 'Obsidian' : 'Ivory'}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-1.5 max-h-56 overflow-y-auto space-y-0.5">
            {SKINS.slice(2).map(s => {
              const active = skin === s.id;
              const sw = SWATCH_COLORS[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelectSkin(s.id);
                    setOpen(false);
                  }}
                  className="w-full px-2 py-1.5 rounded-lg text-left text-xs flex items-center justify-between gap-2 hover:bg-white/[0.06] transition"
                  style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                      style={{ background: `linear-gradient(135deg, ${sw.bg} 50%, ${sw.accent} 50%)` }}
                    />
                    <span className="truncate">{s.label}</span>
                  </span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
