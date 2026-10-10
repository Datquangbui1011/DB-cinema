import { useCallback, useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, Badge, EmptyState, Skeleton, SortHeader, Pagination, filterSelectClass } from '../../components/admin/ui';
import { Avatar } from '../../components/admin/SalesDrawers';
import { useSalesDrawers } from '../../components/admin/useSalesDrawers';
import { formatMoney, formatNumber, formatPercent, formatRelative } from '../../lib/adminFormat';

const shortDate = (date) => date
    ? new Date(date).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

const Customers = () => {
    const { axios, getToken } = useAppContext();
    const { openCustomer, element: drawers } = useSalesDrawers();

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [source, setSource] = useState('');
    const [sort, setSort] = useState('-spent');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedSearch, source, sort]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ sort, page: String(page), limit: '25' });
            if (debouncedSearch) p.set('search', debouncedSearch);
            if (source) p.set('source', source);
            const { data } = await axios.get(`/api/admin/customers-table?${p}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load customers');
        } finally {
            setLoading(false);
        }
    }, [axios, getToken, debouncedSearch, source, sort, page]);

    useEffect(() => { load(); }, [load]);

    const summary = data?.summary;

    return (
        <>
            <PageHeader title="Customers" description="Everyone who has an account, with what they've booked and spent." />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email…" className={`${filterSelectClass} w-60 pl-8`} />
                </div>
                <select value={source} onChange={e => setSource(e.target.value)} className={filterSelectClass}>
                    <option value="">Real and simulated</option>
                    <option value="real">Real only</option>
                    <option value="simulated">Simulated only</option>
                </select>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                    ['Customers', summary && formatNumber(summary.customers)],
                    ['Total spent', summary && formatMoney(summary.spent, { compact: true })],
                    ['Average spend', summary && formatMoney(summary.averageSpend)],
                    ['Repeat customers', summary && formatPercent(summary.repeatRate, 0)],
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
                ) : data.customers.length === 0 ? (
                    <EmptyState icon={Users} title="No customers match" />
                ) : (
                    <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        <table className="w-full min-w-[860px] text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                                    <SortHeader label="Customer" field="name" sort={sort} onSort={setSort} />
                                    <SortHeader label="Bookings" field="bookings" sort={sort} onSort={setSort} className="text-right" />
                                    <th className="px-4 py-2.5 font-medium text-right">Tickets</th>
                                    <SortHeader label="Total spent" field="spent" sort={sort} onSort={setSort} className="text-right" />
                                    <th className="px-4 py-2.5 font-medium">First visit</th>
                                    <SortHeader label="Last visit" field="lastVisit" sort={sort} onSort={setSort} />
                                </tr>
                            </thead>
                            <tbody>
                                {data.customers.map(c => (
                                    <tr key={c.id} onClick={() => openCustomer(c.id)} className="cursor-pointer border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar src={c.image} />
                                                <div className="min-w-0">
                                                    <p className="flex items-center gap-2 text-zinc-100">
                                                        <span className="max-w-52 truncate">{c.name}</span>
                                                        {c.isSimulated && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Sim</Badge>}
                                                    </p>
                                                    <p className="max-w-64 truncate text-xs text-zinc-500">{c.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{formatNumber(c.bookings)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400">{formatNumber(c.tickets)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-100">{formatMoney(c.spent)}</td>
                                        <td className="px-4 py-3 tabular-nums text-zinc-400">{shortDate(c.firstVisit)}</td>
                                        <td className="px-4 py-3">
                                            <p className="tabular-nums text-zinc-300">{shortDate(c.lastVisit)}</p>
                                            {c.lastVisit && <p className="text-xs text-zinc-500">{formatRelative(c.lastVisit)}</p>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {data && data.total > 0 && (
                    <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} noun="customers" onPage={setPage} />
                )}
            </Panel>

            {drawers}
        </>
    );
};

export default Customers;
