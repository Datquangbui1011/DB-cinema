import { useCallback, useEffect, useState } from 'react';
import { Download, Search, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, EmptyState, Skeleton, SegmentedControl, SortHeader, Pagination, filterSelectClass } from '../../components/admin/ui';
import { Avatar, PaymentBadge } from '../../components/admin/SalesDrawers';
import { useSalesDrawers } from '../../components/admin/useSalesDrawers';
import { formatDateTime, formatMoney, formatNumber, formatPercent, formatRelative } from '../../lib/adminFormat';
import { getTheaterType, theaterTypes } from '../../lib/theaterTypes';

const CINEMA_TIMEZONE = 'America/Chicago';
const DAY_MS = 86_400_000;
const localDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });

// Presets filter by when the booking was made
const RANGES = [
    { value: 'today', label: 'Today', days: 1 },
    { value: '7d', label: '7 days', days: 7 },
    { value: '30d', label: '30 days', days: 30 },
    { value: 'all', label: 'All', days: null },
];
const resolveRange = (value) => {
    const days = RANGES.find(r => r.value === value)?.days;
    return days ? { from: localDate(Date.now() - (days - 1) * DAY_MS), to: localDate(Date.now()) } : {};
};

const Bookings = () => {
    const { axios, getToken, adminRole } = useAppContext();
    const { openBooking, openCustomer, element: drawers } = useSalesDrawers();

    const [range, setRange] = useState('7d');
    const [status, setStatus] = useState('');
    const [source, setSource] = useState('');
    const [room, setRoom] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState('-time');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => { setPage(1); }, [range, status, source, room, debouncedSearch, sort]);

    const params = useCallback(() => {
        const p = new URLSearchParams(resolveRange(range));
        if (status) p.set('status', status);
        if (source) p.set('source', source);
        if (room) p.set('room', room);
        if (debouncedSearch) p.set('search', debouncedSearch);
        return p;
    }, [range, status, source, room, debouncedSearch]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = params();
            p.set('sort', sort);
            p.set('page', String(page));
            p.set('limit', '25');
            const { data } = await axios.get(`/api/admin/bookings-table?${p}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load bookings');
        } finally {
            setLoading(false);
        }
    }, [axios, getToken, params, sort, page]);

    useEffect(() => { load(); }, [load]);

    // Downloads the current filters as CSV (admins only)
    const exportCsv = async () => {
        setExporting(true);
        try {
            const response = await axios.get(`/api/admin/bookings-export?${params()}`, {
                headers: { Authorization: `Bearer ${await getToken()}` },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bookings-${localDate(Date.now())}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            toast.error('Could not export bookings');
        } finally {
            setExporting(false);
        }
    };

    const summary = data?.summary;

    return (
        <>
            <PageHeader
                title="Bookings"
                description="Every booking, newest first. Click a row for details."
                actions={adminRole === 'admin' && (
                    <button onClick={exportCsv} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
                        <Download className="w-4 h-4" />{exporting ? 'Exporting…' : 'Export CSV'}
                    </button>
                )}
            />

            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <SegmentedControl options={RANGES} value={range} onChange={setRange} />
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer, email, movie or ID…" className={`${filterSelectClass} w-60 pl-8`} />
                    </div>
                    <select value={status} onChange={e => setStatus(e.target.value)} className={filterSelectClass}>
                        <option value="">Paid and unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="unpaid">Unpaid</option>
                    </select>
                    <select value={room} onChange={e => setRoom(e.target.value)} className={filterSelectClass}>
                        <option value="">All rooms</option>
                        {theaterTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                    <select value={source} onChange={e => setSource(e.target.value)} className={filterSelectClass}>
                        <option value="">Real and simulated</option>
                        <option value="real">Real only</option>
                        <option value="simulated">Simulated only</option>
                    </select>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                    ['Bookings', summary && formatNumber(summary.bookings)],
                    ['Revenue (paid)', summary && formatMoney(summary.revenue, { compact: true })],
                    ['Tickets (paid)', summary && formatNumber(summary.tickets)],
                    ['Checkout conversion', summary && formatPercent(summary.conversion, 1)],
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
                ) : data.bookings.length === 0 ? (
                    <EmptyState icon={Ticket} title="No bookings match these filters" description="Try a wider date range or clear a filter." />
                ) : (
                    <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        <table className="w-full min-w-[980px] text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                    <SortHeader label="Booked" field="time" sort={sort} onSort={setSort} />
                                    <th className="px-4 py-2.5 font-medium">Customer</th>
                                    <th className="px-4 py-2.5 font-medium">Movie</th>
                                    <th className="px-4 py-2.5 font-medium">Showtime</th>
                                    <th className="px-4 py-2.5 font-medium">Seats</th>
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                    <SortHeader label="Amount" field="amount" sort={sort} onSort={setSort} className="text-right" />
                                </tr>
                            </thead>
                            <tbody>
                                {data.bookings.map(b => {
                                    const roomType = b.theaterType ? getTheaterType(b.theaterType) : null;
                                    return (
                                        <tr key={b.id} onClick={() => openBooking(b.id)} className="cursor-pointer border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                                            <td className="px-4 py-3">
                                                <p className="tabular-nums text-zinc-200">{formatDateTime(b.createdAt)}</p>
                                                <p className="text-xs text-zinc-500">{formatRelative(b.createdAt)}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={e => { e.stopPropagation(); openCustomer(b.customerId); }}
                                                    className="flex items-center gap-2.5 text-left hover:underline"
                                                >
                                                    <Avatar src={b.customerImage} />
                                                    <span className="min-w-0">
                                                        <span className="block max-w-44 truncate text-zinc-100">{b.customer}</span>
                                                        <span className="block max-w-44 truncate text-xs text-zinc-500">{b.customerEmail}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3"><p className="max-w-52 truncate text-zinc-200" title={b.movie}>{b.movie}</p></td>
                                            <td className="px-4 py-3">
                                                <p className="tabular-nums text-zinc-300">{b.showStart ? formatDateTime(b.showStart) : '—'}</p>
                                                <p className={`text-xs ${roomType ? roomType.text : 'text-zinc-500'}`}>{[b.screenName, b.theaterType].filter(Boolean).join(' · ') || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="tabular-nums text-zinc-200">{b.seats.length}</p>
                                                <p className="max-w-28 truncate text-xs text-zinc-500" title={b.seats.join(', ')}>{b.seats.join(', ')}</p>
                                            </td>
                                            <td className="px-4 py-3"><PaymentBadge isPaid={b.isPaid} isSimulated={b.isSimulated} /></td>
                                            <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-100">{formatMoney(b.amount)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {data && data.total > 0 && (
                    <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} noun="bookings" onPage={setPage} />
                )}
            </Panel>

            {drawers}
        </>
    );
};

export default Bookings;
