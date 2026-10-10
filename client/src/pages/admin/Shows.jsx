import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, Badge, EmptyState, Skeleton, ProgressBar, SegmentedControl, ConfirmDialog, SortHeader, Pagination, filterSelectClass as selectClass } from '../../components/admin/ui';
import { formatMoney, formatNumber, formatPercent, formatTime, posterUrl } from '../../lib/adminFormat';
import { getTheaterType } from '../../lib/theaterTypes';
import ShowDetailsDialog from '../../components/admin/ShowDetailsDialog';
import ShowFormDrawer from '../../components/admin/ShowFormDrawer';

const CINEMA_TIMEZONE = 'America/Chicago';
const DAY_MS = 86_400_000;
const localDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });

// Date presets resolve to [from, to] in cinema-local YYYY-MM-DD
const RANGES = [
    { value: 'today', label: 'Today', range: () => [0, 0] },
    { value: 'next7', label: 'Next 7 days', range: () => [0, 6] },
    { value: 'next14', label: 'Next 14 days', range: () => [0, 13] },
    { value: 'past7', label: 'Past 7 days', range: () => [-7, -1] },
    { value: 'all', label: 'All', range: () => null },
];
const resolveRange = (value) => {
    const offsets = RANGES.find(r => r.value === value)?.range();
    if (!offsets) return {};
    return { from: localDate(Date.now() + offsets[0] * DAY_MS), to: localDate(Date.now() + offsets[1] * DAY_MS) };
};

const STATUS_BADGE = {
    upcoming: { tone: 'info', label: 'Upcoming' },
    live: { tone: 'success', label: 'Playing' },
    ended: { tone: 'neutral', label: 'Ended' },
    soldout: { tone: 'danger', label: 'Sold out' },
};

const Shows = () => {
    const { axios, getToken, adminRole } = useAppContext();
    const isAdmin = adminRole === 'admin';

    const [range, setRange] = useState('next7');
    const [movie, setMovie] = useState('');
    const [screen, setScreen] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState('time');
    const [page, setPage] = useState(1);

    const [filters, setFilters] = useState({ movies: [], screens: [] });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const [viewingId, setViewingId] = useState(null);
    const [editing, setEditing] = useState(null);       // a show row, or 'new'
    const [cancelling, setCancelling] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Any filter change starts again from the first page
    useEffect(() => { setPage(1); }, [range, movie, screen, status, debouncedSearch, sort]);

    const loadFilters = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/admin/shows-filters', { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setFilters(data);
        } catch (error) {
            console.error(error);
        }
    }, [axios, getToken]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ ...resolveRange(range), sort, page: String(page), limit: '25' });
            if (movie) params.set('movie', movie);
            if (screen) params.set('screen', screen);
            if (status) params.set('status', status);
            if (debouncedSearch) params.set('search', debouncedSearch);
            const { data } = await axios.get(`/api/admin/shows-table?${params}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load shows');
        } finally {
            setLoading(false);
        }
    }, [axios, getToken, range, movie, screen, status, debouncedSearch, sort, page]);

    useEffect(() => { loadFilters(); }, [loadFilters]);
    useEffect(() => { load(); }, [load]);

    const confirmCancel = async () => {
        setBusy(true);
        try {
            const { data } = await axios.delete(`/api/admin/shows/${cancelling.id}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) {
                toast.success(data.message);
                setCancelling(null);
                load();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Could not cancel the show');
        } finally {
            setBusy(false);
        }
    };

    const summary = data?.summary;

    return (
        <>
            <PageHeader
                title="Shows"
                description="Every showtime across all screens. Filter, sort, and open any show to see its bookings."
                actions={isAdmin && (
                    <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dull">
                        <Plus className="w-4 h-4" />Add shows
                    </button>
                )}
            />

            {/* Filters */}
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="overflow-x-auto no-scrollbar">
                    <SegmentedControl options={RANGES} value={range} onChange={setRange} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search movie…" className={`${selectClass} w-44 pl-8`} />
                    </div>
                    <select value={movie} onChange={e => setMovie(e.target.value)} className={`${selectClass} max-w-48`}>
                        <option value="">All movies</option>
                        {filters.movies.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                    <select value={screen} onChange={e => setScreen(e.target.value)} className={selectClass}>
                        <option value="">All screens</option>
                        {filters.screens.map(s => <option key={s.id} value={s.id}>{s.name} · {s.theaterType}</option>)}
                        <option value="none">No screen</option>
                    </select>
                    <select value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
                        <option value="">Any status</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="live">Playing now</option>
                        <option value="soldout">Sold out</option>
                        <option value="ended">Ended</option>
                    </select>
                </div>
            </div>

            {/* Totals for the current filters */}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                    ['Shows', summary && formatNumber(summary.shows)],
                    ['Tickets sold', summary && formatNumber(summary.seatsSold)],
                    ['Occupancy', summary && formatPercent(summary.occupancy, 1)],
                    ['Revenue', summary && formatMoney(summary.revenue, { compact: true })],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                        <p className="text-xs text-zinc-500">{label}</p>
                        {value === undefined ? <Skeleton className="mt-1.5 h-6 w-20" /> : <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">{value}</p>}
                    </div>
                ))}
            </div>

            <Panel bodyClassName="p-0">
                {loading && !data ? (
                    <div className="p-5"><Skeleton className="h-96 w-full" /></div>
                ) : data.shows.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="No shows match these filters" description="Try a wider date range or clear a filter." />
                ) : (
                    <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        <table className="w-full min-w-[960px] text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                    <SortHeader label="Showtime" field="time" sort={sort} onSort={setSort} />
                                    <th className="px-4 py-2.5 font-medium">Movie</th>
                                    <th className="px-4 py-2.5 font-medium">Screen</th>
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                    <SortHeader label="Seats sold" field="occupancy" sort={sort} onSort={setSort} />
                                    <SortHeader label="Revenue" field="revenue" sort={sort} onSort={setSort} className="text-right" />
                                    <th className="px-4 py-2.5 font-medium text-right">Price</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.shows.map(show => {
                                    const room = getTheaterType(show.theaterType);
                                    const badge = STATUS_BADGE[show.status];
                                    const editable = isAdmin && (show.status === 'upcoming' || show.status === 'soldout');
                                    const start = new Date(show.start);
                                    return (
                                        <tr key={show.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                                            <td className="px-4 py-3">
                                                <p className="font-medium tabular-nums text-zinc-100">{formatTime(show.start)}</p>
                                                <p className="text-xs text-zinc-500">{start.toLocaleDateString('en-US', { timeZone: CINEMA_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="h-10 w-7 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                                                        {posterUrl(show.poster_path) && <img src={posterUrl(show.poster_path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="max-w-56 truncate text-zinc-100" title={show.title}>{show.title}</p>
                                                        <p className="text-xs text-zinc-500">{show.runtime} min</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-zinc-200">{show.screenName || '—'}</p>
                                                <p className={`text-xs ${room.text}`}>{room.name}</p>
                                            </td>
                                            <td className="px-4 py-3"><Badge tone={badge.tone}>{badge.label}</Badge></td>
                                            <td className="px-4 py-3">
                                                <div className="flex w-36 items-center gap-2">
                                                    <ProgressBar value={show.seatsSold / data.capacity} color="bg-emerald-500" />
                                                    <span className="w-12 text-right text-xs tabular-nums text-zinc-400">{show.seatsSold}/{data.capacity}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-zinc-100">{formatMoney(show.revenue)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-zinc-400">{formatMoney(show.showPrice + room.premium)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => setViewingId(show.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="View bookings" aria-label="View bookings">
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    {editable && (
                                                        <button onClick={() => setEditing(show)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Edit" aria-label="Edit show">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {editable && show.seatsSold === 0 && (
                                                        <button onClick={() => setCancelling(show)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400" title="Cancel show" aria-label="Cancel show">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {data && data.total > 0 && (
                    <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} noun="shows" onPage={setPage} />
                )}
            </Panel>

            {viewingId && <ShowDetailsDialog showId={viewingId} onClose={() => setViewingId(null)} />}

            {editing && (
                <ShowFormDrawer
                    show={editing === 'new' ? null : editing}
                    movies={filters.movies}
                    screens={filters.screens}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); loadFilters(); }}
                />
            )}

            {cancelling && (
                <ConfirmDialog
                    title="Cancel this show?"
                    message={`${cancelling.title} on ${cancelling.screenName || 'no screen'} at ${formatTime(cancelling.start)} will be removed. No tickets have been sold for it.`}
                    confirmLabel="Cancel show"
                    danger
                    busy={busy}
                    onConfirm={confirmCancel}
                    onCancel={() => setCancelling(null)}
                />
            )}
        </>
    );
};

export default Shows;
