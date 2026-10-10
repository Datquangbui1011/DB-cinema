import { useEffect } from 'react';
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';

// Shared building blocks for the admin console

export const PageHeader = ({ title, description, actions }) => (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
            {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

export const Panel = ({ title, description, actions, children, className = '', bodyClassName = '' }) => (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-900/60 ${className}`}>
        {(title || actions) && (
            <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-zinc-800/80">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
                    {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
                </div>
                {actions}
            </header>
        )}
        <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
);

export const DeltaBadge = ({ change, invert = false }) => {
    if (change === null || change === undefined || !isFinite(change)) {
        return <span className="text-xs text-zinc-500">No prior data</span>;
    }
    const up = change >= 0;
    const good = invert ? !up : up;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${good ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            <Icon className="w-3 h-3" />
            {Math.abs(change * 100).toFixed(1)}%
        </span>
    );
};

export const StatCard = ({ label, value, change, icon: Icon, hint, loading }) => (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
            {Icon && <Icon className="w-4 h-4 text-zinc-600" />}
        </div>
        {loading ? (
            <Skeleton className="mt-3 h-8 w-28" />
        ) : (
            <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">{value}</div>
        )}
        <div className="mt-2 flex items-center gap-2 min-h-5">
            {!loading && change !== undefined && <DeltaBadge change={change} />}
            {hint && <span className="text-xs text-zinc-500">{hint}</span>}
        </div>
    </div>
);

const BADGE_TONES = {
    neutral: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

export const Badge = ({ tone = 'neutral', className = '', children }) => (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${className || BADGE_TONES[tone]}`}>
        {children}
    </span>
);

export const Skeleton = ({ className = '' }) => (
    <div className={`animate-pulse rounded-md bg-zinc-800/80 ${className}`} />
);

export const EmptyState = ({ icon, title, description }) => {
    const Icon = icon || Inbox;
    return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-full bg-zinc-800/80 p-3">
                <Icon className="w-5 h-5 text-zinc-500" />
            </div>
            <p className="mt-3 text-sm font-medium text-zinc-300">{title}</p>
            {description && <p className="mt-1 max-w-xs text-xs text-zinc-500">{description}</p>}
        </div>
    );
};

export const SegmentedControl = ({ options, value, onChange }) => (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
        {options.map(option => (
            <button
                key={option.value}
                onClick={() => onChange(option.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${value === option.value
                    ? 'bg-zinc-700 text-zinc-50 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
            >
                {option.label}
            </button>
        ))}
    </div>
);

export const ProgressBar = ({ value, color = 'bg-primary', className = '' }) => (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 ${className}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
);

export const ConfirmDialog = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Keep it', danger = false, busy = false, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
        <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
                <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900">{cancelLabel}</button>
                <button
                    onClick={onConfirm}
                    disabled={busy}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dull'}`}
                >
                    {busy ? 'Working…' : confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

// Table header that sorts by `field`; clicking again flips the direction
export const SortHeader = ({ label, field, sort, onSort, className = '' }) => {
    const active = sort === field || sort === `-${field}`;
    const descending = sort === `-${field}`;
    return (
        <th className={`px-4 py-2.5 font-medium ${className}`}>
            <button onClick={() => onSort(active && !descending ? `-${field}` : field)} className={`inline-flex items-center gap-1 hover:text-zinc-200 ${active ? 'text-zinc-200' : ''}`}>
                {label}
                {active && (descending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
            </button>
        </th>
    );
};

export const Pagination = ({ page, pages, limit, total, noun = 'items', onPage }) => (
    <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-xs text-zinc-400">
        <span className="tabular-nums">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total.toLocaleString('en-US')} {noun}
        </span>
        <div className="flex items-center gap-1">
            <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="rounded-md p-1.5 hover:bg-zinc-800 disabled:opacity-30" aria-label="Previous page">
                <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 tabular-nums">Page {page} of {pages}</span>
            <button onClick={() => onPage(page + 1)} disabled={page >= pages} className="rounded-md p-1.5 hover:bg-zinc-800 disabled:opacity-30" aria-label="Next page">
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    </div>
);

// Right-hand side panel; closes on backdrop click or Escape
export const Drawer = ({ title, subtitle, onClose, children, footer, width = 'max-w-md' }) => {
    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
            <aside role="dialog" aria-modal="true" className={`flex h-full w-full ${width} flex-col border-l border-zinc-800 bg-zinc-950`} onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-zinc-100">{title}</h2>
                        {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close">
                        <X className="w-4 h-4" />
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
                {footer && <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">{footer}</footer>}
            </aside>
        </div>
    );
};

export const filterSelectClass = 'rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600';
