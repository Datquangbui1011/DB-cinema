import { useCallback, useEffect, useState } from 'react';
import { CalendarX, Film, Pause, Play, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, Badge, EmptyState, Skeleton, SortHeader, Pagination, ConfirmDialog, filterSelectClass } from '../../components/admin/ui';
import { formatDateTime, formatMoney, formatNumber, posterUrl } from '../../lib/adminFormat';

const Movies = () => {
    const { axios, getToken, adminRole } = useAppContext();
    const isAdmin = adminRole === 'admin';

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [status, setStatus] = useState('');
    const [sort, setSort] = useState('-upcoming');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedSearch, status, sort]);

    const auth = useCallback(async () => ({ headers: { Authorization: `Bearer ${await getToken()}` } }), [getToken]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ sort, page: String(page), limit: '25' });
            if (debouncedSearch) p.set('search', debouncedSearch);
            if (status) p.set('status', status);
            const { data } = await axios.get(`/api/admin/movies-table?${p}`, await auth());
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load movies');
        } finally {
            setLoading(false);
        }
    }, [axios, auth, debouncedSearch, status, sort, page]);

    useEffect(() => { load(); }, [load]);

    const togglePause = async (movie) => {
        try {
            const { data } = await axios.patch(`/api/admin/movies/${movie.id}`, { paused: !movie.paused }, await auth());
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) load();
        } catch (error) {
            console.error(error);
            toast.error('Could not update the movie');
        }
    };

    const runScheduler = async () => {
        setRunning(true);
        try {
            const { data } = await axios.post('/api/admin/schedule-movies', {}, await auth());
            if (data.success) {
                const created = (data.report.days || []).reduce((n, d) => n + (d.shows || 0), 0);
                toast.success(`Scheduler finished: ${data.report.added.length} new movie${data.report.added.length === 1 ? '' : 's'}, ${created} new show${created === 1 ? '' : 's'}`);
                load();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('The scheduler could not run');
        } finally {
            setRunning(false);
        }
    };

    const confirmRemove = async () => {
        setBusy(true);
        try {
            const { data } = await axios.delete(`/api/admin/movies/${removing.id}/upcoming-shows`, await auth());
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) { setRemoving(null); load(); }
        } catch (error) {
            console.error(error);
            toast.error('Could not remove shows');
        } finally {
            setBusy(false);
        }
    };

    const summary = data?.summary;

    return (
        <>
            <PageHeader
                title="Movies"
                description="Every movie in the catalog. The nightly scheduler picks the latest releases from TMDB; pause a movie to keep it off the schedule."
                actions={isAdmin && (
                    <button onClick={runScheduler} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
                        <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />{running ? 'Running…' : 'Run scheduler now'}
                    </button>
                )}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search titles…" className={`${filterSelectClass} w-56 pl-8`} />
                </div>
                <select value={status} onChange={e => setStatus(e.target.value)} className={filterSelectClass}>
                    <option value="">All movies</option>
                    <option value="scheduled">Has upcoming shows</option>
                    <option value="unscheduled">No upcoming shows</option>
                    <option value="paused">Paused</option>
                </select>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
                {[
                    ['Movies', summary && formatNumber(summary.movies)],
                    ['With upcoming shows', summary && formatNumber(summary.scheduled)],
                    ['Paused', summary && formatNumber(summary.paused)],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                        <p className="text-xs text-zinc-500">{label}</p>
                        {value === undefined ? <Skeleton className="mt-1.5 h-6 w-16" /> : <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">{value}</p>}
                    </div>
                ))}
            </div>

            <Panel bodyClassName="p-0">
                {loading && !data ? <div className="p-5"><Skeleton className="h-96 w-full" /></div> : data.movies.length === 0 ? (
                    <EmptyState icon={Film} title="No movies match" />
                ) : (
                    <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        <table className="w-full min-w-[900px] text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                    <SortHeader label="Movie" field="title" sort={sort} onSort={setSort} />
                                    <SortHeader label="Released" field="release" sort={sort} onSort={setSort} />
                                    <SortHeader label="Upcoming shows" field="upcoming" sort={sort} onSort={setSort} className="text-right" />
                                    <th className="px-4 py-2.5 font-medium">Next show</th>
                                    <SortHeader label="Revenue (all time)" field="revenue" sort={sort} onSort={setSort} className="text-right" />
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                    {isAdmin && <th className="px-4 py-2.5 font-medium text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {data.movies.map(m => (
                                    <tr key={m.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                                                    {posterUrl(m.poster_path) && <img src={posterUrl(m.poster_path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="max-w-72 truncate font-medium text-zinc-100" title={m.title}>{m.title}</p>
                                                    <p className="max-w-72 truncate text-xs text-zinc-500">{[m.runtime && `${m.runtime} min`, m.genres.slice(0, 3).join(', '), m.rating && `★ ${m.rating.toFixed(1)}`].filter(Boolean).join(' · ')}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-400">{m.release_date || '—'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <p className="tabular-nums text-zinc-100">{formatNumber(m.upcomingShows)}</p>
                                            <p className="text-xs tabular-nums text-zinc-500">{formatNumber(m.playedShows)} played</p>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-zinc-400">{m.nextShow ? formatDateTime(m.nextShow) : '—'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <p className="tabular-nums text-zinc-100">{formatMoney(m.revenue)}</p>
                                            <p className="text-xs tabular-nums text-zinc-500">{formatNumber(m.tickets)} tickets</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {m.paused ? <Badge tone="warning">Paused</Badge> : m.upcomingShows ? <Badge tone="success">Scheduled</Badge> : <Badge>Not scheduled</Badge>}
                                        </td>
                                        {isAdmin && (
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => togglePause(m)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800" title={m.paused ? 'Allow the scheduler to add shows again' : 'Stop the scheduler adding new shows'}>
                                                        {m.paused ? <><Play className="w-3.5 h-3.5" />Resume</> : <><Pause className="w-3.5 h-3.5" />Pause</>}
                                                    </button>
                                                    {m.upcomingShows > 0 && (
                                                        <button onClick={() => setRemoving(m)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-red-500/10 hover:text-red-400" title="Remove upcoming shows with no tickets sold">
                                                            <CalendarX className="w-3.5 h-3.5" />Clear unsold
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {data && data.total > 0 && <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} noun="movies" onPage={setPage} />}
            </Panel>

            {removing && (
                <ConfirmDialog
                    title={`Clear unsold shows for ${removing.title}?`}
                    message={`Upcoming shows with no tickets sold will be removed. Shows that already have tickets stay. ${removing.paused ? '' : 'Pause the movie too if the scheduler shouldn\'t add new ones.'}`}
                    confirmLabel="Remove unsold shows"
                    danger
                    busy={busy}
                    onConfirm={confirmRemove}
                    onCancel={() => setRemoving(null)}
                />
            )}
        </>
    );
};

export default Movies;
