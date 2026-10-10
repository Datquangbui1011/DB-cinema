import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Armchair, DollarSign, Download, Film, Percent, Receipt, Ticket, TrendingDown, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, StatCard, SegmentedControl, EmptyState, Skeleton, ProgressBar, Badge, filterSelectClass } from '../../components/admin/ui';
import { ChartTooltip } from '../../components/admin/charts';
import { axisProps, gridColor } from '../../lib/chartTheme';
import { downloadCsv } from '../../lib/csv';
import { formatMoney, formatNumber, formatPercent, posterUrl } from '../../lib/adminFormat';
import { getTheaterType, theaterTypes } from '../../lib/theaterTypes';

const CINEMA_TIMEZONE = 'America/Chicago';
const DAY_MS = 86_400_000;
const localDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });
const shortLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const PRESETS = [
    { value: '7', label: '7D' },
    { value: '30', label: '30D' },
    { value: '90', label: '90D' },
    { value: 'custom', label: 'Custom' },
];

const SECTIONS = [
    ['revenue', 'Revenue'],
    ['occupancy', 'Occupancy'],
    ['movies', 'Movies'],
    ['rooms', 'Rooms & screens'],
    ['sales', 'Sales & checkout'],
    ['customers', 'Customers'],
];

const hourLabel = (hour) => new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' });

// Admin-only CSV button for a panel
const ExportButton = ({ onClick }) => (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" title="Download as CSV">
        <Download className="w-3 h-3" />CSV
    </button>
);

const MiniStat = ({ label, value, tone = 'text-zinc-50' }) => (
    <div className="rounded-lg bg-zinc-800/50 px-3 py-2.5">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
);

const Heatmap = ({ cells, dayNames }) => {
    if (cells.length === 0) return <EmptyState icon={Armchair} title="No shows in this period" />;
    const hours = [...new Set(cells.map(c => c.hour))].sort((a, b) => a - b);
    const byKey = Object.fromEntries(cells.map(c => [`${c.dow}-${c.hour}`, c]));
    // Monday first, as a cinema week is usually read
    const days = [1, 2, 3, 4, 5, 6, 0];

    return (
        <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-[11px]">
                <thead>
                    <tr>
                        <th />
                        {hours.map(h => <th key={h} className="px-1 font-normal text-zinc-500">{hourLabel(h)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {days.map(dow => (
                        <tr key={dow}>
                            <td className="pr-2 text-zinc-400">{dayNames[dow]}</td>
                            {hours.map(h => {
                                const cell = byKey[`${dow}-${h}`];
                                return (
                                    <td
                                        key={h}
                                        title={cell ? `${dayNames[dow]} ${hourLabel(h)}: ${formatPercent(cell.occupancy)} full across ${cell.shows} shows` : 'No shows'}
                                        className="h-8 w-12 rounded text-center tabular-nums"
                                        style={cell
                                            ? { background: `rgba(16, 185, 129, ${0.08 + cell.occupancy * 0.85})`, color: cell.occupancy > 0.55 ? '#022c22' : '#e4e4e7' }
                                            : { background: '#18181b', color: '#52525b' }}
                                    >
                                        {cell ? Math.round(cell.occupancy * 100) : '–'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-2 text-[11px] text-zinc-500">Average % of seats sold by day and start time. Darker means fuller.</p>
        </div>
    );
};

const Analytics = () => {
    const { axios, getToken, adminRole } = useAppContext();
    const isAdmin = adminRole === 'admin';

    const [preset, setPreset] = useState('30');
    const [customFrom, setCustomFrom] = useState(localDate(Date.now() - 29 * DAY_MS));
    const [customTo, setCustomTo] = useState(localDate(Date.now()));
    const [room, setRoom] = useState('');
    const [movie, setMovie] = useState('');
    const [movieOptions, setMovieOptions] = useState([]);
    const [showAllMovies, setShowAllMovies] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (preset === 'custom') {
                p.set('from', customFrom);
                p.set('to', customTo);
            } else {
                p.set('from', localDate(Date.now() - (Number(preset) - 1) * DAY_MS));
                p.set('to', localDate(Date.now()));
            }
            if (room) p.set('room', room);
            if (movie) p.set('movie', movie);
            const { data } = await axios.get(`/api/admin/analytics?${p}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load analytics');
        } finally {
            setLoading(false);
        }
    }, [axios, getToken, preset, customFrom, customTo, room, movie]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await axios.get('/api/admin/shows-filters', { headers: { Authorization: `Bearer ${await getToken()}` } });
                if (data.success) setMovieOptions(data.movies);
            } catch (error) {
                console.error(error);
            }
        })();
    }, [axios, getToken]);

    const kpis = data?.kpis;
    const fileSuffix = data ? `${data.range.from}_to_${data.range.to}` : '';
    const roomRows = data ? data.revenue.byRoom.map(r => ({ ...r, color: getTheaterType(r.type).color })) : [];
    const movieRows = data ? (showAllMovies ? data.movies.rows : data.movies.rows.slice(0, 12)) : [];
    const maxMovieRevenue = Math.max(1, ...(data?.movies.rows || []).map(m => m.revenue));

    return (
        <>
            <PageHeader
                title="Analytics"
                description={data ? `${shortLabel(data.range.from)} – ${shortLabel(data.range.to)} (${data.range.days} days), compared with ${shortLabel(data.range.prevFrom)} – ${shortLabel(data.range.prevTo)}.` : 'Trends across revenue, occupancy, movies and customers.'}
            />

            {/* Filters */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <SegmentedControl options={PRESETS} value={preset} onChange={setPreset} />
                {preset === 'custom' && (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <input type="date" value={customFrom} max={customTo} onChange={e => e.target.value && setCustomFrom(e.target.value)} className={filterSelectClass} />
                        to
                        <input type="date" value={customTo} min={customFrom} onChange={e => e.target.value && setCustomTo(e.target.value)} className={filterSelectClass} />
                    </span>
                )}
                <select value={room} onChange={e => setRoom(e.target.value)} className={filterSelectClass}>
                    <option value="">All rooms</option>
                    {theaterTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <select value={movie} onChange={e => setMovie(e.target.value)} className={`${filterSelectClass} max-w-56`}>
                    <option value="">All movies</option>
                    {movieOptions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
                {loading && data && <span className="text-xs text-zinc-500">Updating…</span>}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Revenue" icon={DollarSign} loading={!data} value={formatMoney(kpis?.revenue.value, { compact: true })} change={kpis?.revenue.change} />
                <StatCard label="Tickets" icon={Ticket} loading={!data} value={formatNumber(kpis?.tickets.value)} change={kpis?.tickets.change} />
                <StatCard label="Avg. ticket" icon={Receipt} loading={!data} value={formatMoney(kpis?.avgTicket.value)} change={kpis?.avgTicket.change} />
                <StatCard label="Occupancy" icon={Armchair} loading={!data} value={formatPercent(kpis?.occupancy.value, 1)} change={kpis?.occupancy.change} />
                <StatCard label="Checkout conversion" icon={Percent} loading={!data} value={formatPercent(kpis?.conversion.value, 1)} change={kpis?.conversion.change} />
                <StatCard label="Customers" icon={Users} loading={!data} value={formatNumber(kpis?.customers.value)} change={kpis?.customers.change} />
            </div>

            {/* Section shortcuts */}
            <nav className="sticky top-0 z-10 -mx-1 mt-5 mb-4 flex gap-1 overflow-x-auto bg-zinc-950/90 px-1 py-2 backdrop-blur no-scrollbar">
                {SECTIONS.map(([id, label]) => (
                    <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}
                        className="flex-shrink-0 rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                        {label}
                    </a>
                ))}
            </nav>

            {!data ? <Skeleton className="h-[600px] w-full" /> : (
                <div className={`space-y-8 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    {/* ---------------- Revenue ---------------- */}
                    <section id="revenue" className="scroll-mt-16 space-y-4">
                        <h2 className="text-base font-semibold text-zinc-100">Revenue</h2>
                        <div className="grid gap-4 xl:grid-cols-3">
                            <Panel
                                className="xl:col-span-2"
                                title="Revenue by day"
                                description="Paid bookings by the day they were made; dashed line is the previous period"
                                actions={isAdmin && <ExportButton onClick={() => downloadCsv(`revenue-by-day_${fileSuffix}.csv`, data.revenue.daily, [['Date', r => r.date], ['Revenue', r => r.revenue], ['Tickets', r => r.tickets], ['Previous period revenue', r => r.previous]])} />}
                            >
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data.revenue.daily.map(d => ({ ...d, label: shortLabel(d.date) }))} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="analyticsRevenue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#DC2626" stopOpacity={0.35} />
                                                    <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke={gridColor} vertical={false} />
                                            <XAxis dataKey="label" {...axisProps} minTickGap={20} />
                                            <YAxis {...axisProps} width={56} tickFormatter={v => formatMoney(v, { compact: true })} />
                                            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#3f3f46' }} />
                                            <Line type="monotone" dataKey="previous" name="Previous period" stroke="#71717a" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                                            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#DC2626" strokeWidth={2} fill="url(#analyticsRevenue)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>

                            <Panel title="Where revenue comes from" description="Base ticket price vs. room upgrade charges">
                                <div className="grid grid-cols-2 gap-2">
                                    <MiniStat label="Base tickets" value={formatMoney(data.revenue.split.base, { compact: true })} />
                                    <MiniStat label="Room upgrades" value={formatMoney(data.revenue.split.upgrade, { compact: true })} tone="text-purple-300" />
                                </div>
                                <div className="mt-4 h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={[...roomRows].sort((a, b) => b.revenue - a.revenue)} layout="vertical" margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                                            <CartesianGrid stroke={gridColor} horizontal={false} />
                                            <XAxis type="number" {...axisProps} tickFormatter={v => formatMoney(v, { compact: true })} />
                                            <YAxis type="category" dataKey="type" {...axisProps} stroke="#a1a1aa" width={92} />
                                            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#27272a' }} />
                                            <Bar dataKey="base" name="Base" stackId="a" fill="#52525b" barSize={12} />
                                            <Bar dataKey="upgrade" name="Upgrade" stackId="a" radius={[0, 4, 4, 0]} barSize={12}>
                                                {[...roomRows].sort((a, b) => b.revenue - a.revenue).map(r => <Cell key={r.type} fill={r.color} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                        </div>
                    </section>

                    {/* ---------------- Occupancy ---------------- */}
                    <section id="occupancy" className="scroll-mt-16 space-y-4">
                        <h2 className="text-base font-semibold text-zinc-100">Occupancy</h2>
                        <div className="grid gap-4 xl:grid-cols-3">
                            <Panel
                                className="xl:col-span-2"
                                title="When shows fill up"
                                description="Shows that have already started in this period"
                                actions={isAdmin && <ExportButton onClick={() => downloadCsv(`occupancy-heatmap_${fileSuffix}.csv`, data.occupancy.heatmap, [['Day', c => data.dayNames[c.dow]], ['Start hour', c => c.hour], ['Shows', c => c.shows], ['Seats sold', c => c.seatsSold], ['Occupancy', c => c.occupancy.toFixed(3)]])} />}
                            >
                                <Heatmap cells={data.occupancy.heatmap} dayNames={data.dayNames} />
                            </Panel>
                            <Panel title="At a glance">
                                <div className="grid grid-cols-2 gap-2">
                                    <MiniStat label="Shows played" value={formatNumber(data.occupancy.totalShows)} />
                                    <MiniStat label="Average occupancy" value={formatPercent(kpis.occupancy.value, 1)} tone="text-emerald-400" />
                                    <MiniStat label="Sold out" value={formatNumber(data.occupancy.soldOut)} />
                                    <MiniStat label="Empty (0 sold)" value={formatNumber(data.occupancy.empty)} tone={data.occupancy.empty ? 'text-amber-400' : 'text-zinc-50'} />
                                </div>
                            </Panel>
                        </div>
                    </section>

                    {/* ---------------- Movies ---------------- */}
                    <section id="movies" className="scroll-mt-16 space-y-4">
                        <h2 className="text-base font-semibold text-zinc-100">Movies</h2>
                        <Panel
                            title="Movie performance"
                            description="Ranked by revenue. Revenue per show and occupancy show how hard each title works its screen time."
                            bodyClassName="p-0"
                            actions={isAdmin && <ExportButton onClick={() => downloadCsv(`movies_${fileSuffix}.csv`, data.movies.rows, [['Movie', m => m.title], ['Shows', m => m.shows], ['Tickets', m => m.tickets], ['Revenue', m => m.revenue], ['Revenue per show', m => m.revenuePerShow.toFixed(2)], ['Occupancy', m => m.occupancy.toFixed(3)]])} />}
                        >
                            {data.movies.rows.length === 0 ? <EmptyState icon={Film} title="No movie data in this period" /> : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead>
                                            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                                <th className="px-4 py-2.5 font-medium">Movie</th>
                                                <th className="px-4 py-2.5 font-medium text-right">Shows</th>
                                                <th className="px-4 py-2.5 font-medium text-right">Tickets</th>
                                                <th className="px-4 py-2.5 font-medium">Revenue</th>
                                                <th className="px-4 py-2.5 font-medium text-right">Per show</th>
                                                <th className="px-4 py-2.5 font-medium">Occupancy</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {movieRows.map(m => (
                                                <tr key={m.movieId} className="border-b border-zinc-800/60 last:border-0">
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="h-9 w-6 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                                                                {posterUrl(m.poster_path) && <img src={posterUrl(m.poster_path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />}
                                                            </span>
                                                            <span className="max-w-60 truncate text-zinc-100" title={m.title}>{m.title}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">{formatNumber(m.shows)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">{formatNumber(m.tickets)}</td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex w-44 items-center gap-2">
                                                            <ProgressBar value={m.revenue / maxMovieRevenue} />
                                                            <span className="w-16 text-right tabular-nums text-zinc-100">{formatMoney(m.revenue, { compact: true })}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">{formatMoney(m.revenuePerShow)}</td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex w-32 items-center gap-2">
                                                            <ProgressBar value={m.occupancy} color={m.occupancy < data.movies.thresholds.occupancy ? 'bg-amber-500' : 'bg-emerald-500'} />
                                                            <span className="w-10 text-right text-xs tabular-nums text-zinc-400">{formatPercent(m.occupancy)}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {data.movies.rows.length > 12 && (
                                        <button onClick={() => setShowAllMovies(v => !v)} className="w-full border-t border-zinc-800 py-2.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">
                                            {showAllMovies ? 'Show top 12' : `Show all ${data.movies.rows.length} movies`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </Panel>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <Panel title="Underperformers" description={`At least ${data.movies.thresholds.minShows} shows and under ${formatPercent(data.movies.thresholds.occupancy)} full: candidates for fewer showings`}>
                                {data.movies.underperformers.length === 0 ? (
                                    <EmptyState icon={TrendingDown} title="No underperforming movies" description="Every movie with enough showings is filling at least a quarter of its seats." />
                                ) : (
                                    <ul className="space-y-2.5">
                                        {data.movies.underperformers.slice(0, 8).map(m => (
                                            <li key={m.movieId} className="flex items-center justify-between gap-3 text-sm">
                                                <span className="truncate text-zinc-200">{m.title}</span>
                                                <span className="flex-shrink-0 text-xs tabular-nums text-zinc-400">{m.shows} shows · <span className="text-amber-400">{formatPercent(m.occupancy)}</span> full</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Panel>
                            <Panel title="Revenue by genre" description="A movie counts toward each of its genres">
                                {data.movies.genres.length === 0 ? <EmptyState icon={Film} title="No genre data" /> : (
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.movies.genres.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                                                <CartesianGrid stroke={gridColor} horizontal={false} />
                                                <XAxis type="number" {...axisProps} tickFormatter={v => formatMoney(v, { compact: true })} />
                                                <YAxis type="category" dataKey="genre" {...axisProps} stroke="#a1a1aa" width={96} />
                                                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#27272a' }} />
                                                <Bar dataKey="revenue" name="Revenue" fill="#DC2626" radius={[0, 4, 4, 0]} barSize={12} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </Panel>
                        </div>
                    </section>

                    {/* ---------------- Rooms & screens ---------------- */}
                    <section id="rooms" className="scroll-mt-16 space-y-4">
                        <h2 className="text-base font-semibold text-zinc-100">Rooms & screens</h2>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <Panel
                                title="Room types"
                                bodyClassName="p-0"
                                actions={isAdmin && <ExportButton onClick={() => downloadCsv(`rooms_${fileSuffix}.csv`, data.revenue.byRoom, [['Room', r => r.type], ['Shows', r => r.shows], ['Occupancy', r => r.occupancy.toFixed(3)], ['Tickets', r => r.tickets], ['Avg ticket', r => r.avgTicket.toFixed(2)], ['Revenue', r => r.revenue], ['Upgrade revenue', r => r.upgrade]])} />}
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[520px] text-sm">
                                        <thead>
                                            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                                <th className="px-4 py-2.5 font-medium">Room</th>
                                                <th className="px-4 py-2.5 font-medium text-right">Shows</th>
                                                <th className="px-4 py-2.5 font-medium">Occupancy</th>
                                                <th className="px-4 py-2.5 font-medium text-right">Avg. ticket</th>
                                                <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.revenue.byRoom.filter(r => r.shows || r.revenue).map(r => {
                                                const type = getTheaterType(r.type);
                                                return (
                                                    <tr key={r.type} className="border-b border-zinc-800/60 last:border-0">
                                                        <td className="px-4 py-2.5"><Badge className={type.badge}>{type.name}</Badge></td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">{formatNumber(r.shows)}</td>
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex w-32 items-center gap-2">
                                                                <ProgressBar value={r.occupancy} color="bg-emerald-500" />
                                                                <span className="w-10 text-right text-xs tabular-nums text-zinc-400">{formatPercent(r.occupancy)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">{formatMoney(r.avgTicket)}</td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-100">{formatMoney(r.revenue, { compact: true })}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>
                            <Panel
                                title="Screen utilization"
                                description="Share of opening hours each screen spent playing a movie, and how full it was"
                                actions={isAdmin && <ExportButton onClick={() => downloadCsv(`screens_${fileSuffix}.csv`, data.occupancy.byScreen, [['Screen', s => s.name], ['Room', s => s.theaterType], ['Shows', s => s.shows], ['Utilization', s => s.utilization.toFixed(3)], ['Occupancy', s => s.occupancy.toFixed(3)]])} />}
                            >
                                <ul className="space-y-2.5">
                                    {data.occupancy.byScreen.map(s => (
                                        <li key={s.id} className="grid grid-cols-[7rem_1fr_3rem_4.5rem] items-center gap-3 text-xs">
                                            <span className="truncate"><span className="text-zinc-200">{s.name}</span> <span className={getTheaterType(s.theaterType).text}>{s.theaterType}</span></span>
                                            <ProgressBar value={s.utilization} color="bg-sky-500" />
                                            <span className="text-right tabular-nums text-zinc-300">{formatPercent(s.utilization)}</span>
                                            <span className="text-right tabular-nums text-zinc-500">{formatPercent(s.occupancy)} full</span>
                                        </li>
                                    ))}
                                </ul>
                            </Panel>
                        </div>
                    </section>

                    {/* ---------------- Sales & checkout ---------------- */}
                    <section id="sales" className="scroll-mt-16 space-y-4">
                        <h2 className="text-base font-semibold text-zinc-100">Sales & checkout</h2>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <MiniStat label="Checkouts started" value={formatNumber(data.sales.started)} />
                            <MiniStat label="Paid" value={formatNumber(data.sales.paid)} tone="text-emerald-400" />
                            <MiniStat label="Abandoned" value={formatNumber(data.sales.abandoned)} tone="text-amber-400" />
                            <MiniStat label="Conversion" value={formatPercent(data.sales.conversion, 1)} />
                        </div>
                        <div className="grid gap-4 xl:grid-cols-3">
                            <Panel
                                title="When people book"
                                description="Checkouts started and paid, by hour of day"
                                actions={isAdmin && <ExportButton onClick={() => downloadCsv(`bookings-by-hour_${fileSuffix}.csv`, data.sales.hourly, [['Hour', h => h.hour], ['Started', h => h.started], ['Paid', h => h.paid]])} />}
                            >
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.sales.hourly.map(h => ({ ...h, label: hourLabel(h.hour), abandonedCount: h.started - h.paid }))} margin={{ top: 5, right: 0, left: -15, bottom: 0 }}>
                                            <CartesianGrid stroke={gridColor} vertical={false} />
                                            <XAxis dataKey="label" {...axisProps} interval={3} />
                                            <YAxis {...axisProps} />
                                            <Tooltip content={<ChartTooltip formatter={formatNumber} />} cursor={{ fill: '#27272a' }} />
                                            <Bar dataKey="paid" name="Paid" stackId="a" fill="#10b981" />
                                            <Bar dataKey="abandonedCount" name="Abandoned" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                            <Panel title="How far ahead" description="Time between booking and showtime (paid)">
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.sales.leadTime} margin={{ top: 5, right: 0, left: -15, bottom: 0 }}>
                                            <CartesianGrid stroke={gridColor} vertical={false} />
                                            <XAxis dataKey="label" {...axisProps} interval={0} fontSize={10} />
                                            <YAxis {...axisProps} />
                                            <Tooltip content={<ChartTooltip formatter={formatNumber} />} cursor={{ fill: '#27272a' }} />
                                            <Bar dataKey="count" name="Bookings" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                            <Panel title="Group size" description="Seats per paid booking">
                                <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.sales.groupSizes} margin={{ top: 5, right: 0, left: -15, bottom: 0 }}>
                                            <CartesianGrid stroke={gridColor} vertical={false} />
                                            <XAxis dataKey="size" {...axisProps} />
                                            <YAxis {...axisProps} />
                                            <Tooltip content={<ChartTooltip formatter={formatNumber} labelFormatter={l => `${l} seat${l === '1' ? '' : 's'}`} />} cursor={{ fill: '#27272a' }} />
                                            <Bar dataKey="count" name="Bookings" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                        </div>
                    </section>

                    {/* ---------------- Customers ---------------- */}
                    <section id="customers" className="scroll-mt-16 space-y-4">
                        <h2 className="text-base font-semibold text-zinc-100">Customers</h2>
                        <div className="grid gap-4 xl:grid-cols-3">
                            <Panel title="New vs. returning" description="New customers made their first ever paid booking in this period">
                                {data.customers.active === 0 ? <EmptyState icon={Users} title="No customers in this period" /> : (
                                    <>
                                        <div className="h-44">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={[{ name: 'New', value: data.customers.new }, { name: 'Returning', value: data.customers.returning }]} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                                                        <Cell fill="#DC2626" />
                                                        <Cell fill="#52525b" />
                                                    </Pie>
                                                    <Tooltip content={<ChartTooltip formatter={formatNumber} />} />
                                                    <Legend verticalAlign="bottom" height={24} formatter={v => <span className="text-xs text-zinc-400">{v}</span>} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <MiniStat label="Active customers" value={formatNumber(data.customers.active)} />
                                            <MiniStat label="Avg. spend" value={formatMoney(data.customers.avgSpend)} />
                                        </div>
                                    </>
                                )}
                            </Panel>
                            <Panel title="How often they book" description="Paid bookings per customer in this period">
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.customers.frequency} margin={{ top: 5, right: 0, left: -15, bottom: 0 }}>
                                            <CartesianGrid stroke={gridColor} vertical={false} />
                                            <XAxis dataKey="label" {...axisProps} />
                                            <YAxis {...axisProps} allowDecimals={false} />
                                            <Tooltip content={<ChartTooltip formatter={formatNumber} />} cursor={{ fill: '#27272a' }} />
                                            <Bar dataKey="count" name="Customers" fill="#f472b6" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                            <Panel
                                title="Top customers"
                                description="By spend in this period"
                                actions={isAdmin && <ExportButton onClick={() => downloadCsv(`top-customers_${fileSuffix}.csv`, data.customers.top, [['Customer', c => c.name], ['Bookings', c => c.bookings], ['Spent', c => c.spent], ['Simulated', c => (c.isSimulated ? 'yes' : 'no')]])} />}
                            >
                                {data.customers.top.length === 0 ? <EmptyState icon={Users} title="No customers yet" /> : (
                                    <ol className="space-y-2.5">
                                        {data.customers.top.map((c, i) => (
                                            <li key={c.id} className="flex items-center gap-2.5 text-sm">
                                                <span className="w-4 text-xs tabular-nums text-zinc-500">{i + 1}</span>
                                                {c.image ? <img src={c.image} alt="" className="h-6 w-6 rounded-full" /> : <span className="h-6 w-6 rounded-full bg-zinc-800" />}
                                                <span className="min-w-0 flex-1 truncate text-zinc-200">{c.name}</span>
                                                <span className="text-xs tabular-nums text-zinc-500">{c.bookings} bookings</span>
                                                <span className="w-16 text-right tabular-nums text-zinc-100">{formatMoney(c.spent, { compact: true })}</span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </Panel>
                        </div>
                    </section>
                </div>
            )}
        </>
    );
};

export default Analytics;
