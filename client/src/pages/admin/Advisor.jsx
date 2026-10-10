import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CalendarCheck, ChevronDown, DollarSign, Lightbulb, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, StatCard, Badge, EmptyState, Skeleton, SegmentedControl, SortHeader, Pagination, ConfirmDialog, filterSelectClass } from '../../components/admin/ui';
import RecommendationCard, { ForecastBar } from '../../components/admin/RecommendationCard';
import { REC_TYPES } from '../../lib/recommendationTypes';
import ShowDetailsDialog from '../../components/admin/ShowDetailsDialog';
import AdvisorAccuracy from '../../components/admin/AdvisorAccuracy';
import AutopilotSettings from '../../components/admin/AutopilotSettings';
import { formatDateTime, formatMoney, formatNumber, formatPercent, formatRelative, posterUrl } from '../../lib/adminFormat';
import { getTheaterType } from '../../lib/theaterTypes';

const PAGE_SIZE = 25;
const CINEMA_TIMEZONE = 'America/Chicago';
const cinemaDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });
const dayLabel = (dateStr) => new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

// What will happen when an option is applied, in plain words
const applyMessage = (rec, option) => {
    switch (rec.type) {
        case 'add_showtime':
            return option.params.replaceShowId
                ? `A new showing of ${rec.movie.title} is added (${option.label.split(' · replaces')[0]}) and the unsold ${option.label.match(/replaces (.+) \(forecast/)?.[1] || 'show'} showing it replaces is cancelled.`
                : `A new showing of ${rec.movie.title} is added: ${option.label}.`;
        case 'upgrade_room':
            return `The show moves to ${option.label.split(' · ')[0]}. Tickets already sold stay valid at their price; new tickets cost more.`;
        case 'promotion':
            return `Tickets for this show go on sale at ${option.label}, until the show starts. You can end the promotion early.`;
        case 'cancel':
            return 'This showing is removed from the schedule. No tickets have been sold for it.';
        default:
            return option.label;
    }
};

// "Trained on simulated data" banner with the model's honest accuracy
const ModelBanner = ({ model }) => {
    const [open, setOpen] = useState(false);
    if (!model) return null;
    const m = model.metrics;
    return (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <span className="text-amber-200">
                    Model trained on <strong>simulated</strong> bookings
                </span>
                <span className="text-xs text-zinc-400">
                    {model.version} · trained {formatRelative(model.trainedAt)} · average error ±{m.model.mae.toFixed(1)} seats
                    (simple baseline ±{m.baseline.mae.toFixed(1)}, sales pace ±{m.paceBaseline.mae.toFixed(1)}) · range right {formatPercent(m.rangeCoverage)} of the time
                </span>
                <button onClick={() => setOpen(v => !v)} className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
                    Details<ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>
            {open && (
                <div className="mt-3 grid gap-4 border-t border-amber-500/10 pt-3 text-xs text-zinc-400 lg:grid-cols-2">
                    <div>
                        <p className="mb-1.5 font-medium text-zinc-300">Average error by how far ahead (seats)</p>
                        <table className="w-full max-w-sm tabular-nums">
                            <thead><tr className="text-left text-zinc-500"><th className="py-0.5 font-medium">Ahead</th><th className="font-medium">Model</th><th className="font-medium">Sales pace</th><th className="font-medium">Simple</th></tr></thead>
                            <tbody>
                                {Object.entries(m.bySnapshotHours).sort((a, b) => b[0] - a[0]).map(([h, s]) => (
                                    <tr key={h}><td className="py-0.5">{h}h</td><td className="text-zinc-200">{s.model.mae.toFixed(1)}</td><td>{s.pace.mae.toFixed(1)}</td><td>{s.baseline.mae.toFixed(1)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="space-y-1.5">
                        <p>{model.dataNote}</p>
                        {m.promotion && (
                            <p>
                                Discount effects: the model predicts {Object.entries(m.promotion.byDiscount).map(([p, r]) => `${formatPercent(r.modelLift)} more seats at ${p}% off (simulator ${formatPercent(r.simulatedLift)})`).join(', ')}.
                                It under-estimates larger discounts, so promotion impact uses stated assumptions instead.
                            </p>
                        )}
                        <p>Top signals: {model.featureImportance.slice(0, 5).map(f => f.feature).join(', ')}.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const Advisor = () => {
    const { axios, getToken, adminRole } = useAppContext();
    const isAdmin = adminRole === 'admin';
    const [data, setData] = useState(null);
    const [accuracy, setAccuracy] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [typeFilter, setTypeFilter] = useState('all');
    const [showLow, setShowLow] = useState(false);
    const [confirming, setConfirming] = useState(null);      // { rec, option }
    const [viewingShow, setViewingShow] = useState(null);

    // Forecast table
    const [day, setDay] = useState('');
    const [room, setRoom] = useState('');
    const [adviceOnly, setAdviceOnly] = useState(false);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('time');
    const [page, setPage] = useState(1);

    const auth = useCallback(async () => ({ headers: { Authorization: `Bearer ${await getToken()}` } }), [getToken]);

    const load = useCallback(async () => {
        try {
            const headers = await auth();
            const [{ data }, { data: acc }] = await Promise.all([
                axios.get('/api/admin/advisor', headers),
                axios.get('/api/admin/advisor/accuracy?days=30', headers),
            ]);
            if (data.success) setData(data);
            else toast.error(data.message);
            if (acc.success) setAccuracy(acc);
        } catch (error) {
            console.error(error);
            toast.error('Could not load the AI Advisor');
        }
    }, [axios, auth]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setPage(1); }, [day, room, adviceOnly, search, sort]);

    const refresh = async () => {
        setRefreshing(true);
        try {
            const { data } = await axios.post('/api/admin/advisor/refresh', {}, await auth());
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) await load();
        } catch (error) {
            console.error(error);
            toast.error('Could not refresh the forecast');
        } finally {
            setRefreshing(false);
        }
    };

    const act = async (request, fallbackError) => {
        setBusy(true);
        try {
            const { data } = await request();
            data.success ? toast.success(data.message) : toast.error(data.message);
            // An expired recommendation means the server already refreshed the advice
            if (data.success || data.expired) { setConfirming(null); await load(); }
        } catch (error) {
            console.error(error);
            toast.error(fallbackError);
        } finally {
            setBusy(false);
        }
    };

    const saveSettings = async (settings) => act(
        async () => axios.patch('/api/admin/advisor/settings', {
            autopilot: settings.autopilot,
            maxAutoActionsPerDay: settings.maxAutoActionsPerDay,
            maxAutoDiscountPercent: settings.maxAutoDiscountPercent,
        }, await auth()),
        'Could not save the autopilot settings',
    );
    const runAutopilot = async () => act(
        async () => axios.post('/api/admin/advisor/autopilot/run', {}, await auth()),
        'Could not run the autopilot',
    );

    const apply = async ({ rec, option }) => act(
        async () => axios.post(`/api/admin/recommendations/${rec.id}/apply`, { optionId: option.id }, await auth()),
        'Could not apply the recommendation',
    );
    const dismiss = async (rec) => act(
        async () => axios.patch(`/api/admin/recommendations/${rec.id}`, { status: 'dismissed' }, await auth()),
        'Could not dismiss the recommendation',
    );
    const undo = async (rec) => act(
        async () => axios.post(`/api/admin/recommendations/${rec.id}/undo`, {}, await auth()),
        'Could not undo the recommendation',
    );

    const recs = useMemo(() => data?.recommendations || [], [data]);
    const typeCounts = useMemo(() => recs.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + 1 }), {}), [recs]);
    const filteredRecs = recs.filter(r => typeFilter === 'all' || r.type === typeFilter);
    const visibleRecs = showLow ? filteredRecs : filteredRecs.filter(r => r.priority !== 'low');
    const hiddenLow = filteredRecs.length - visibleRecs.length;
    const adviceByShow = useMemo(() => {
        const map = new Map();
        recs.forEach(r => map.set(r.show, [...(map.get(r.show) || []), r.type]));
        return map;
    }, [recs]);

    const forecasts = useMemo(() => data?.forecasts || [], [data]);
    const days = useMemo(() => [...new Set(forecasts.map(f => cinemaDate(f.showDateTime)))], [forecasts]);
    const rooms = useMemo(() => [...new Set(forecasts.map(f => f.theaterType))].sort(), [forecasts]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = forecasts.filter(f =>
            (!day || cinemaDate(f.showDateTime) === day) &&
            (!room || f.theaterType === room) &&
            (!adviceOnly || adviceByShow.has(f.show)) &&
            (!q || f.movie.title.toLowerCase().includes(q)));
        const desc = sort.startsWith('-');
        const key = { time: f => new Date(f.showDateTime), occupancy: f => f.occupancy, revenue: f => f.predictedRevenue }[sort.replace('-', '')];
        return [...list].sort((a, b) => (key(a) - key(b)) * (desc ? -1 : 1));
    }, [forecasts, day, room, adviceOnly, search, sort, adviceByShow]);
    const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const s = data?.summary;
    const loading = !data;

    return (
        <>
            <PageHeader
                title="AI Advisor"
                description="Forecasts ticket sales for every upcoming show and recommends what to do about the busiest and quietest ones."
                actions={
                    <>
                        {data?.lastRun && <span className="text-xs text-zinc-500">Updated {formatRelative(data.lastRun.ranAt)}</span>}
                        {isAdmin && (
                            <button onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
                                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Forecasting…' : 'Refresh forecast'}
                            </button>
                        )}
                    </>
                }
            />

            <ModelBanner model={data?.model} />

            <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard label="Forecast revenue · 7 days" icon={DollarSign} loading={loading} value={s && formatMoney(s.forecastRevenue7d, { compact: true })} hint={s && `${formatNumber(s.forecastTickets7d)} tickets · ${formatPercent(s.averageOccupancy7d)} full on average`} />
                <StatCard label="Likely sell-outs" icon={TrendingUp} loading={loading} value={s && formatNumber(s.likelySellOuts)} hint={`Forecast at least ${formatPercent(data?.thresholds.sellOut || 0.95)} full`} />
                <StatCard label="At-risk shows" icon={TrendingDown} loading={loading} value={s && formatNumber(s.atRisk)} hint={`Forecast under ${formatPercent(data?.thresholds.promotion || 0.3)} full`} />
                <StatCard label="Potential uplift" icon={Lightbulb} loading={loading} value={s && formatMoney(s.potentialUplift)} hint={s && `If the best option of all ${s.pendingRecommendations} recommendations is applied`} />
            </div>

            <Panel
                title="Recommendations"
                description={isAdmin ? 'Choose an option to apply it. Every change can be undone.' : 'Only admins can apply recommendations.'}
                className="mb-6"
            >
                {recs.length > 0 && (
                    <div className="mb-4 overflow-x-auto">
                        <SegmentedControl
                            value={typeFilter}
                            onChange={setTypeFilter}
                            options={[{ value: 'all', label: `All ${recs.length}` }, ...Object.entries(REC_TYPES).filter(([t]) => typeCounts[t]).map(([t, info]) => ({ value: t, label: `${info.label} ${typeCounts[t]}` }))]}
                        />
                    </div>
                )}
                {loading ? <Skeleton className="h-48 w-full" /> : filteredRecs.length === 0 ? (
                    <EmptyState icon={CalendarCheck} title="Nothing to act on right now" description="No show is forecast to sell out or to be nearly empty enough to need a change." />
                ) : (
                    <div className="space-y-3">
                        {visibleRecs.map(rec => (
                            <RecommendationCard key={rec.id} rec={rec} canApply={isAdmin} busy={busy}
                                onChoose={(r, option) => setConfirming({ rec: r, option })} onDismiss={dismiss} onOpenShow={setViewingShow} />
                        ))}
                        {visibleRecs.length === 0 && <p className="text-sm text-zinc-500">Only low-priority recommendations here.</p>}
                        {hiddenLow > 0 && (
                            <button onClick={() => setShowLow(true)} className="w-full rounded-lg border border-dashed border-zinc-800 py-2 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200">
                                Show {hiddenLow} low-priority recommendation{hiddenLow === 1 ? '' : 's'}
                            </button>
                        )}
                    </div>
                )}
            </Panel>

            <AutopilotSettings settings={data?.settings} lastRun={data?.lastAutopilot} isAdmin={isAdmin} onSave={saveSettings} onRun={runAutopilot} />

            {data?.recentlyApplied?.length > 0 && (
                <Panel title="Recently applied" description="Changes made from recommendations" className="mb-6">
                    <div className="space-y-3">
                        {data.recentlyApplied.map(rec => (
                            <RecommendationCard key={rec.id} rec={rec} canApply={isAdmin} busy={busy} onUndo={undo} onOpenShow={setViewingShow} />
                        ))}
                    </div>
                </Panel>
            )}

            <AdvisorAccuracy data={accuracy} />

            <Panel title="Forecast for every upcoming show" description="Sold now, the forecast (white tick) and its likely range. Click a show for details." bodyClassName="p-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search movies…" className={`${filterSelectClass} w-48 pl-8`} />
                    </div>
                    <select value={day} onChange={e => setDay(e.target.value)} className={filterSelectClass}>
                        <option value="">All days</option>
                        {days.map(d => <option key={d} value={d}>{dayLabel(d)}</option>)}
                    </select>
                    <select value={room} onChange={e => setRoom(e.target.value)} className={filterSelectClass}>
                        <option value="">All rooms</option>
                        {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                        <input type="checkbox" checked={adviceOnly} onChange={e => setAdviceOnly(e.target.checked)} className="accent-red-600" />
                        With recommendations only
                    </label>
                </div>
                {loading ? <div className="p-5"><Skeleton className="h-96 w-full" /></div> : rows.length === 0 ? (
                    <EmptyState icon={BrainCircuit} title="No forecasts match" description={forecasts.length ? 'Try different filters.' : 'Refresh the forecast to predict upcoming shows.'} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[880px] text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                    <th className="px-4 py-2.5 font-medium">Show</th>
                                    <SortHeader label="Time" field="time" sort={sort} onSort={setSort} />
                                    <th className="px-4 py-2.5 font-medium w-64">Sold → forecast</th>
                                    <SortHeader label="Occupancy" field="occupancy" sort={sort} onSort={setSort} className="text-right" />
                                    <SortHeader label="Revenue (est.)" field="revenue" sort={sort} onSort={setSort} className="text-right" />
                                    <th className="px-4 py-2.5 font-medium">Advice</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map(f => {
                                    const roomInfo = getTheaterType(f.theaterType);
                                    return (
                                        <tr key={f.show} onClick={() => setViewingShow(f.show)} className="cursor-pointer border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="h-10 w-7 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                                                        {posterUrl(f.movie.poster_path) && <img src={posterUrl(f.movie.poster_path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="max-w-60 truncate text-zinc-100" title={f.movie.title}>{f.movie.title}</p>
                                                        <p className="text-xs text-zinc-500"><span className={roomInfo?.text}>{f.theaterType}</span>{f.screenName ? ` · ${f.screenName}` : ''}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-400">{formatDateTime(f.showDateTime)}</td>
                                            <td className="px-4 py-2.5">
                                                <ForecastBar sold={f.sold} low={f.low} high={f.high} predicted={f.predictedSeats} capacity={f.capacity} />
                                                <p className="mt-1 text-xs tabular-nums text-zinc-500">{f.sold} sold → <span className="text-zinc-200">{Math.round(f.predictedSeats)}</span> ({Math.round(f.low)}–{Math.round(f.high)}) of {f.capacity}</p>
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-zinc-100">{formatPercent(f.occupancy)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-zinc-100">{formatMoney(Math.round(f.predictedRevenue))}</td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex flex-wrap gap-1">
                                                    {(adviceByShow.get(f.show) || []).map(t => <Badge key={t} tone={REC_TYPES[t].tone}>{REC_TYPES[t].label}</Badge>)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {rows.length > 0 && <Pagination page={page} pages={Math.ceil(rows.length / PAGE_SIZE)} limit={PAGE_SIZE} total={rows.length} noun="shows" onPage={setPage} />}
            </Panel>

            {confirming && (
                <ConfirmDialog
                    title={`Apply: ${confirming.rec.title}?`}
                    message={applyMessage(confirming.rec, confirming.option)}
                    confirmLabel="Apply"
                    cancelLabel="Cancel"
                    danger={confirming.rec.type === 'cancel'}
                    busy={busy}
                    onConfirm={() => apply(confirming)}
                    onCancel={() => setConfirming(null)}
                />
            )}
            {viewingShow && <ShowDetailsDialog showId={viewingShow} onClose={() => setViewingShow(null)} onChanged={load} />}
        </>
    );
};

export default Advisor;
