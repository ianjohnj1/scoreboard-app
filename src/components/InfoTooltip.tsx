import { useState } from 'react';
import { Info } from 'lucide-react';

type InfoTooltipProps = {
  content: string;
  label?: string;
  className?: string;
};

export default function InfoTooltip({ content, label = 'More info', className = '' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-charcoal-600 bg-charcoal-800 text-charcoal-400 transition-colors hover:border-success-500/40 hover:text-success-400"
      >
        <Info size={12} />
      </button>

      {open && (
        <span className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border border-charcoal-700 bg-charcoal-900 px-3 py-2 text-left text-xs text-charcoal-200 shadow-2xl">
          {content}
        </span>
      )}
    </span>
  );
}
