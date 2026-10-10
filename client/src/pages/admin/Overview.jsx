import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DollarSign, Ticket, Armchair, Receipt, Users, RefreshCw, Film, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, StatCard, SegmentedControl, EmptyState, Skeleton, ProgressBar, Badge } from '../../components/admin/ui';
import { formatMoney, formatNumber, formatPercent, formatTime, formatDateTime, formatRelative, posterUrl } from '../../lib/adminFormat';
import { getTheaterType } from '../../lib/theaterTypes';

const RANGES = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
];
const RANGE_LABEL = { today: 'vs. yesterday', '7d': 'vs. previous 7 days', '30d': 'vs. previous 30 days', '90d': 'vs. previous 90 days' };
const REFRESH_MS = 60_000;

const ChartTooltip = ({ active, payload, label, formatter = formatMoney }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
            <p className="mb-1 font-medium text-zinc-200">{label}</p>
            {payload.map(p => (
                <p key={p.dataKey} className="flex items-center gap-2 text-zinc-400">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.color }} />
                    {p.name}: <span className="font-medium text-zinc-100 tabular-nums">{formatter(p.value)}</span>
                </p>
            ))}
        </div>
    );
};

const Overview = () => {
    const { axios, getToken } = useAppContext();
    const [range, setRange] = useState('7d');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [, setTick] = useState(0);

    const load = useCallback(async ({ silent = false } = {}) => {
        silent ? setRefreshing(true) : setLoading(true);
        try {
            const { data } = await axios.get(`/api/admin/overview?range=${range}`, {
                headers: { Authorization: `Bearer ${await getToken()}` },
            });
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load overview');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [axios, getToken, range]);

    useEffect(() => { load(); }, [load]);

    // Keep figures fresh and the "updated" label ticking
    useEffect(() => {
        const refresh = setInterval(() => load({ silent: true }), REFRESH_MS);
        const tick = setInterval(() => setTick(t => t + 1), 15_000);
        return () => { clearInterval(refresh); clearInterval(tick); };
    }, [load]);

    const kpis = data?.kpis;
    const hasSales = (kpis?.tickets.value || 0) > 0;
    const roomData = (data?.revenueByRoom || []).map(r => ({ ...r, color: getTheaterType(r.type).color })).sort((a, b) => b.revenue - a.revenue);
    const maxMovieRevenue = Math.max(1, ...(data?.topMovies || []).map(m => m.revenue));

    return (
        <>
            <PageHeader
                title="Overview"
                description="Sales, occupancy and today's schedule at a glance."
                actions={
                    <>
                        <span className="text-xs text-zinc-500 tabular-nums">
                            {data ? `Updated ${formatRelative(data.generatedAt)}` : ''}
                        </span>
                        <button
                            onClick={() => load({ silent: true })}
                            className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                            aria-label="Refresh"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
                    </>
                }
            />

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard label="Revenue" icon={DollarSign} loading={loading} value={formatMoney(kpis?.revenue.value, { compact: true })} change={kpis?.revenue.change} />
                <StatCard label="Tickets sold" icon={Ticket} loading={loading} value={formatNumber(kpis?.tickets.value)} change={kpis?.tickets.change} />
                <StatCard label="Occupancy" icon={Armchair} loading={loading} value={formatPercent(kpis?.occupancy.value, 1)} change={kpis?.occupancy.change} />
                <StatCard label="Avg. ticket" icon={Receipt} loading={loading} value={formatMoney(kpis?.avgTicket.value)} change={kpis?.avgTicket.change} />
                <StatCard label="Customers" icon={Users} loading={loading} value={formatNumber(kpis?.customers.value)} change={kpis?.customers.change} />
            </div>
            <p className="mt-2 mb-6 text-xs text-zinc-500">Changes are {RANGE_LABEL[range]}, over the same elapsed time.</p>

            {/* Revenue trend + today */}
            <div className="grid gap-4 xl:grid-cols-3">
                <Panel
                    className="xl:col-span-2"
                    title="Revenue"
                    description={range === 'today' ? 'By hour, compared with yesterday' : 'By day, compared with the previous period'}
                    actions={
                        <div className="flex items-center gap-4 text-xs text-zinc-400">
                            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" />Current</span>
                            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-zinc-500" />Previous</span>
                        </div>
                    }
                >
                    {loading ? <Skeleton className="h-72 w-full" /> : !hasSales && !data?.trend.some(t => t.previousRevenue) ? (
                        <EmptyState icon={DollarSign} title="No sales in this period" description="Revenue will appear here as paid bookings come in." />
                    ) : (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#DC2626" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#27272a" vertical={false} />
                                    <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
                                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={v => formatMoney(v, { compact: true })} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#3f3f46' }} />
                                    <Line type="monotone" dataKey="previousRevenue" name="Previous" stroke="#71717a" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#DC2626" strokeWidth={2} fill="url(#revenueFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Panel>

                <Panel title="Today" description="Cinema schedule for today (Central time)">
                    {loading ? <Skeleton className="h-72 w-full" /> : (
                        <>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-lg bg-zinc-800/50 py-2.5">
                                    <p className="text-lg font-semibold tabular-nums text-emerald-400">{data.today.nowPlayingCount}</p>
                                    <p className="text-[11px] text-zinc-500">Playing now</p>
                                </div>
                                <div className="rounded-lg bg-zinc-800/50 py-2.5">
                                    <p className="text-lg font-semibold tabular-nums text-zinc-100">{data.today.upcomingCount}</p>
                                    <p className="text-[11px] text-zinc-500">Still to start</p>
                                </div>
                                <div className="rounded-lg bg-zinc-800/50 py-2.5">
                                    <p className="text-lg font-semibold tabular-nums text-zinc-400">{data.today.completed}</p>
                                    <p className="text-[11px] text-zinc-500">Finished</p>
                                </div>
                            </div>
                            <p className="mt-5 mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Starting next</p>
                            {data.today.nextShows.length === 0 ? (
                                <EmptyState icon={CalendarClock} title="No more shows today" description={`${data.today.totalShows} shows were scheduled today.`} />
                            ) : (
                                <ul className="space-y-3">
                                    {data.today.nextShows.map(show => {
                                        const room = getTheaterType(show.theaterType);
                                        return (
                                            <li key={show._id} className="flex items-center gap-3">
                                                <span className="w-16 flex-shrink-0 text-xs font-medium tabular-nums text-zinc-300">{formatTime(show.showDateTime)}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm text-zinc-100">{show.title}</p>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className={`text-[11px] ${room.text}`}>{room.name}</span>
                                                        <ProgressBar value={show.seatsSold / show.capacity} className="flex-1" />
                                                        <span className="text-[11px] tabular-nums text-zinc-500">{show.seatsSold}/{show.capacity}</span>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </>
                    )}
                </Panel>
            </div>

            {/* Rooms + movies */}
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <Panel title="Revenue by room type" description="Which experiences earn the most">
                    {loading ? <Skeleton className="h-64 w-full" /> : !hasSales ? (
                        <EmptyState icon={Armchair} title="No room revenue yet" />
                    ) : (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={roomData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="#27272a" horizontal={false} />
                                    <XAxis type="number" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => formatMoney(v, { compact: true })} />
                                    <YAxis type="category" dataKey="type" stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} width={96} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#27272a' }} />
                                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={14}>
                                        {roomData.map(r => <Cell key={r.type} fill={r.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Panel>

                <Panel title="Top movies" description="By revenue in this period">
                    {loading ? <Skeleton className="h-64 w-full" /> : data.topMovies.length === 0 ? (
                        <EmptyState icon={Film} title="No movie sales yet" />
                    ) : (
                        <ol className="space-y-3.5">
                            {data.topMovies.map((movie, i) => (
                                <li key={movie.movieId} className="flex items-center gap-3">
                                    <span className="w-4 text-xs tabular-nums text-zinc-500">{i + 1}</span>
                                    {posterUrl(movie.poster_path)
                                        ? <img src={posterUrl(movie.poster_path, 'w92')} alt="" className="h-12 w-8 flex-shrink-0 rounded object-cover" />
                                        : <div className="h-12 w-8 flex-shrink-0 rounded bg-zinc-800" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="truncate text-sm text-zinc-100">{movie.title}</p>
                                            <p className="text-sm font-medium tabular-nums text-zinc-100">{formatMoney(movie.revenue)}</p>
                                        </div>
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <ProgressBar value={movie.revenue / maxMovieRevenue} />
                                            <span className="w-20 text-right text-[11px] tabular-nums text-zinc-500">{formatNumber(movie.tickets)} tickets</span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </Panel>
            </div>

            {/* Recent bookings */}
            <Panel className="mt-4" title="Recent bookings" description="Latest paid bookings" bodyClassName="p-0">
                {loading ? <div className="p-5"><Skeleton className="h-48 w-full" /></div> : data.recentBookings.length === 0 ? (
                    <EmptyState icon={Ticket} title="No bookings yet" description="Paid bookings will show up here." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                    <th className="px-5 py-2.5 font-medium">Customer</th>
                                    <th className="px-5 py-2.5 font-medium">Movie</th>
                                    <th className="px-5 py-2.5 font-medium">Room</th>
                                    <th className="px-5 py-2.5 font-medium">Showtime</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Seats</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                                    <th className="px-5 py-2.5 font-medium text-right">Booked</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recentBookings.map(b => {
                                    const room = b.room ? getTheaterType(b.room) : null;
                                    return (
                                        <tr key={b.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    {b.customerImage
                                                        ? <img src={b.customerImage} alt="" className="h-6 w-6 rounded-full" />
                                                        : <div className="h-6 w-6 rounded-full bg-zinc-800" />}
                                                    <span className="text-zinc-100">{b.customer}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-zinc-300">{b.movie}</td>
                                            <td className="px-5 py-3">{room ? <Badge className={room.badge}>{room.name}</Badge> : '—'}</td>
                                            <td className="px-5 py-3 tabular-nums text-zinc-400">{b.showDateTime ? formatDateTime(b.showDateTime) : '—'}</td>
                                            <td className="px-5 py-3 text-right tabular-nums text-zinc-300">{b.seats}</td>
                                            <td className="px-5 py-3 text-right font-medium tabular-nums text-zinc-100">{formatMoney(b.amount)}</td>
                                            <td className="px-5 py-3 text-right text-xs text-zinc-500">{formatRelative(b.createdAt)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

        </>
    );
};

export default Overview;
