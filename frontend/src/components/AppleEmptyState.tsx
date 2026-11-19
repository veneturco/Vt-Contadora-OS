import React from 'react';
import { FileText } from 'lucide-react';

export interface AppleEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const AppleEmptyState: React.FC<AppleEmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction
}) => (
  <div className="ui-card p-8 text-center flex flex-col items-center justify-center space-y-3 border border-white/10 bg-white/[0.02]">
    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]">
      <FileText className="w-5 h-5" />
    </div>
    <div className="max-w-md space-y-1">
      <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
      <p className="text-xs text-white/60 leading-relaxed">{description}</p>
    </div>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-1 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all active:scale-[0.97] shadow"
      >
        {actionLabel}
      </button>
    )}
  </div>
);
