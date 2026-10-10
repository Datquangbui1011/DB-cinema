import { useState } from 'react';
import { ChevronDown, Info, Undo2, X } from 'lucide-react';
import { Badge } from './ui';
import { formatDateTime, formatMoney, formatPercent, posterUrl } from '../../lib/adminFormat';
import { REC_TYPES } from '../../lib/recommendationTypes';

const PRIORITY_TONES = { high: 'danger', medium: 'warning', low: 'neutral' };

const signedMoney = (n) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n))}`;
const signedTickets = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)} ticket${Math.abs(n) === 1 ? '' : 's'}`;

/**
 * Sold seats, the forecast range and the point forecast on a 0..capacity bar.
 * Dark segment: sold now. Light band: likely range. White tick: forecast.
 */
export const ForecastBar = ({ sold, low, high, predicted, capacity = 90, className = '' }) => {
    const pct = (n) => `${Math.min(100, Math.max(0, (n / capacity) * 100))}%`;
    const tone = predicted / capacity >= 0.95 ? 'bg-emerald-500' : predicted / capacity < 0.3 ? 'bg-amber-500' : 'bg-sky-500';
    return (
        <div className={`relative h-2 w-full overflow-hidden rounded-full bg-zinc-800 ${className}`} title={`${sold} sold · forecast ${Math.round(predicted)} (likely ${Math.round(low)}–${Math.round(high)}) of ${capacity}`}>
            <div className={`absolute inset-y-0 rounded-full opacity-30 ${tone}`} style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
            <div className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: pct(sold) }} />
            <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `calc(${pct(predicted)} - 1px)` }} />
        </div>
    );
};

/**
 * One piece of advice. Admins pick an option to apply it; staff only see it.
 * `onChoose(rec, option)` asks for confirmation before anything changes.
 */
const RecommendationCard = ({ rec, canApply, onChoose, onDismiss, onUndo, onOpenShow, busy }) => {
    const [showAssumptions, setShowAssumptions] = useState(false);
    const type = REC_TYPES[rec.type];
    const Icon = type.icon;
    const f = rec.forecast || {};
    const applied = rec.status === 'applied';
    const chosen = rec.options.find(o => o.id === rec.chosenOption);

    return (
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-start gap-3">
                <button onClick={() => onOpenShow?.(rec.show)} className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-zinc-800" title="Open show details">
                    {posterUrl(rec.movie.poster_path) && <img src={posterUrl(rec.movie.poster_path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />}
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={type.tone}><Icon className="w-3 h-3" />{type.label}</Badge>
                        {!applied && <Badge tone={PRIORITY_TONES[rec.priority]}>{rec.priority} priority</Badge>}
                        {applied && <Badge tone="success">Applied{rec.appliedBy === 'autopilot' ? ' by autopilot' : ''}</Badge>}
                        {rec.status === 'undone' && <Badge>Undone</Badge>}
                        <span className="text-xs text-zinc-500">{formatDateTime(rec.showDateTime)}</span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-zinc-100">{rec.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{rec.reason}</p>
                    {f.seats !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                            <ForecastBar sold={f.sold} low={f.low} high={f.high} predicted={f.seats} className="max-w-56" />
                            <span className="text-xs tabular-nums text-zinc-400">{f.sold} sold → {Math.round(f.seats)} ({formatPercent(f.occupancy)})</span>
                        </div>
                    )}
                </div>
                {!applied && rec.status === 'pending' && canApply && (
                    <button onClick={() => onDismiss(rec)} disabled={busy} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Dismiss">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {applied || rec.status === 'undone' ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
                    <span className="text-zinc-300">
                        {chosen ? chosen.label : rec.chosenOption}
                        {chosen && <span className="ml-2 tabular-nums text-emerald-400">{signedMoney(chosen.impact.revenue)} est.</span>}
                    </span>
                    {applied && canApply && onUndo && (
                        <button onClick={() => onUndo(rec)} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
                            <Undo2 className="w-3.5 h-3.5" />Undo
                        </button>
                    )}
                </div>
            ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {rec.options.map(option => (
                        <button
                            key={option.id}
                            onClick={() => onChoose(rec, option)}
                            disabled={!canApply || busy}
                            className="group flex flex-col items-start gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-left transition-colors enabled:hover:border-primary/60 enabled:hover:bg-primary/5 disabled:cursor-not-allowed"
                            title={canApply ? 'Apply this option' : 'Only admins can apply recommendations'}
                        >
                            <span className="text-xs text-zinc-200">{option.label}</span>
                            <span className="text-xs tabular-nums">
                                <span className={option.impact.revenue >= 0 ? 'text-emerald-400' : 'text-red-400'}>{signedMoney(option.impact.revenue)}</span>
                                <span className="text-zinc-500"> · {signedTickets(option.impact.tickets)}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {rec.assumptions?.length > 0 && (
                <div className="mt-2">
                    <button onClick={() => setShowAssumptions(v => !v)} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
                        <Info className="w-3.5 h-3.5" />How is this estimated?
                        <ChevronDown className={`w-3 h-3 transition-transform ${showAssumptions ? 'rotate-180' : ''}`} />
                    </button>
                    {showAssumptions && (
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-zinc-500">
                            {rec.assumptions.map(a => <li key={a}>{a}</li>)}
                            <li>Forecast from the demand model; estimates are before costs unless stated.</li>
                        </ul>
                    )}
                </div>
            )}
        </article>
    );
};

export default RecommendationCard;
