import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Target } from 'lucide-react';
import { Panel, Badge, EmptyState, Skeleton } from './ui';
import { axisProps, gridColor } from '../../lib/chartTheme';
import { formatDateTime, formatPercent } from '../../lib/adminFormat';

const PointTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
            <p className="font-medium text-zinc-200">{p.title}</p>
            <p className="text-zinc-500">{formatDateTime(p.showDateTime)} · forecast {Math.round(p.hoursAhead)}h ahead</p>
            <p className="mt-1 text-zinc-300">Forecast <span className="tabular-nums text-zinc-100">{Math.round(p.predicted)}</span> ({Math.round(p.low)}–{Math.round(p.high)}) · sold <span className="tabular-nums text-zinc-100">{p.actual}</span></p>
        </div>
    );
};

const Stat = ({ label, value, hint }) => (
    <div className="rounded-lg bg-zinc-900 px-3 py-2.5">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-100">{value}</p>
        {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
);

/** Forecast vs what actually sold, for shows the advisor forecast before they started */
const AdvisorAccuracy = ({ data }) => {
    const o = data?.overall;
    return (
        <Panel
            title="How accurate has it been?"
            description={data ? `The last forecast made before each show, compared with the seats it really sold (last ${data.days} days)` : ''}
            actions={data && o.shows > 0 && (data.earlyEstimate
                ? <Badge tone="warning">Early estimate · {o.shows} of {data.minimumShows} shows</Badge>
                : <Badge tone="info">{o.shows} shows measured</Badge>)}
            className="mb-6"
        >
            {!data ? <Skeleton className="h-64 w-full" /> : o.shows === 0 ? (
                <EmptyState icon={Target} title="Nothing to measure yet" description="Accuracy appears once shows the advisor has forecast have started. Each show's last forecast is frozen and compared with its final sales." />
            ) : (
                <div className="grid gap-5 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                        <ResponsiveContainer width="100%" height={260}>
                            <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: -8 }}>
                                <CartesianGrid stroke={gridColor} />
                                <XAxis type="number" dataKey="predicted" name="Forecast" domain={[0, 90]} {...axisProps} label={{ value: 'Forecast seats', position: 'insideBottom', offset: -8, fill: '#71717a', fontSize: 11 }} />
                                <YAxis type="number" dataKey="actual" name="Sold" domain={[0, 90]} {...axisProps} label={{ value: 'Seats sold', angle: -90, position: 'insideLeft', offset: 18, fill: '#71717a', fontSize: 11 }} />
                                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 90, y: 90 }]} stroke="#52525b" strokeDasharray="4 4" />
                                <Tooltip content={<PointTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter data={data.points} fill="#38bdf8" fillOpacity={0.7} />
                            </ScatterChart>
                        </ResponsiveContainer>
                        <p className="text-center text-[11px] text-zinc-500">Dots on the dashed line were forecast exactly.</p>
                    </div>
                    <div className="space-y-3 lg:col-span-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Stat label="Average error" value={`±${o.mae.toFixed(1)} seats`} hint={`If no more tickets sold: ±${o.noMoreSalesMae.toFixed(1)}`} />
                            <Stat label="Inside the likely range" value={formatPercent(o.withinRange)} hint="Target about 80%" />
                            <Stat label="Bias" value={`${o.bias >= 0 ? '+' : ''}${o.bias.toFixed(1)} seats`} hint={o.bias >= 0 ? 'Forecasts run high' : 'Forecasts run low'} />
                            <Stat label="Forecast made" value={`${Math.round(o.averageHoursAhead)}h ahead`} hint="On average, before the show" />
                        </div>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left text-zinc-500">
                                    <th className="py-1 font-medium">Forecast made</th>
                                    <th className="py-1 text-right font-medium">Shows</th>
                                    <th className="py-1 text-right font-medium">Error</th>
                                    <th className="py-1 text-right font-medium">No more sales</th>
                                </tr>
                            </thead>
                            <tbody className="tabular-nums">
                                {data.byHorizon.map(h => (
                                    <tr key={h.label} className="border-t border-zinc-800/70">
                                        <td className="py-1.5 text-zinc-300">{h.label} before</td>
                                        <td className="py-1.5 text-right text-zinc-400">{h.shows}</td>
                                        <td className="py-1.5 text-right text-zinc-100">{h.mae === null ? '—' : `±${h.mae.toFixed(1)}`}</td>
                                        <td className="py-1.5 text-right text-zinc-500">{h.noMoreSalesMae === null ? '—' : `±${h.noMoreSalesMae.toFixed(1)}`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-[11px] leading-relaxed text-zinc-500">
                            "No more sales" assumes a show sells nothing after the forecast; the model should beat it.
                            {data.earlyEstimate && ` Too few shows to judge yet; wait for at least ${data.minimumShows}.`}
                        </p>
                    </div>
                </div>
            )}
        </Panel>
    );
};

export default AdvisorAccuracy;
