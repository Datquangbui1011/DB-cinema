import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FlaskConical, RefreshCw, Server, Timer, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, Badge, Skeleton } from '../../components/admin/ui';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/adminFormat';

const Row = ({ label, children }) => (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
        <span className="text-zinc-500">{label}</span>
        <span className="text-right text-zinc-100">{children}</span>
    </div>
);

const SystemStatus = () => {
    const { axios, getToken } = useAppContext();
    const [data, setData] = useState(null);
    const [checking, setChecking] = useState(false);
    const [runningJob, setRunningJob] = useState(null);

    const auth = useCallback(async () => ({ headers: { Authorization: `Bearer ${await getToken()}` } }), [getToken]);

    const load = useCallback(async () => {
        setChecking(true);
        try {
            const { data } = await axios.get('/api/admin/system', await auth());
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not check the system');
        } finally {
            setChecking(false);
        }
    }, [axios, auth]);

    useEffect(() => { load(); }, [load]);

    const runJob = async (job) => {
        setRunningJob(job);
        try {
            const { data } = job === 'scheduler'
                ? await axios.post('/api/admin/schedule-movies', {}, await auth())
                : await axios.post('/api/admin/simulator/run', {}, await auth());
            if (data.success) {
                toast.success(job === 'scheduler' ? 'Scheduler finished' : data.message);
                load();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('The job could not run');
        } finally {
            setRunningJob(null);
        }
    };

    const failing = data?.services.filter(s => s.status !== 'ok') || [];
    const scheduler = data?.scheduler;
    const simulator = data?.simulator;

    return (
        <>
            <PageHeader
                title="System Status"
                description="Health of the services the cinema depends on, and the background jobs that keep it running."
                actions={(
                    <button onClick={load} disabled={checking} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
                        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />Check again
                    </button>
                )}
            />

            {!data ? <Skeleton className="h-96 w-full" /> : (
                <div className="space-y-4">
                    <div className={`flex items-center gap-3 rounded-xl border p-4 ${failing.length ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                        {failing.length ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                        <div>
                            <p className={`text-sm font-medium ${failing.length ? 'text-red-300' : 'text-emerald-300'}`}>
                                {failing.length ? `${failing.length} service${failing.length === 1 ? ' needs' : 's need'} attention` : 'All systems operational'}
                            </p>
                            <p className="text-xs text-zinc-400">Checked {formatRelative(data.checkedAt)}</p>
                        </div>
                    </div>

                    <Panel title="Services" bodyClassName="p-0">
                        <ul className="divide-y divide-zinc-800/80">
                            {data.services.map(s => (
                                <li key={s.name} className="flex items-center gap-3 px-5 py-3">
                                    {s.status === 'ok' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" /> : <XCircle className="w-4 h-4 flex-shrink-0 text-red-400" />}
                                    <span className="w-44 flex-shrink-0 text-sm text-zinc-100">{s.name}</span>
                                    <span className={`min-w-0 flex-1 truncate text-sm ${s.status === 'ok' ? 'text-zinc-400' : 'text-red-300'}`} title={s.detail}>{s.detail}</span>
                                    <span className="text-xs tabular-nums text-zinc-500">{s.latencyMs} ms</span>
                                </li>
                            ))}
                        </ul>
                    </Panel>

                    <div className="grid gap-4 xl:grid-cols-2">
                        <Panel
                            title="Movie scheduler"
                            description="Runs nightly; picks the latest movies and fills the next 14 days across all screens"
                            actions={(
                                <button onClick={() => runJob('scheduler')} disabled={Boolean(runningJob)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
                                    <Timer className="w-3.5 h-3.5" />{runningJob === 'scheduler' ? 'Running…' : 'Run now'}
                                </button>
                            )}
                        >
                            <div className="divide-y divide-zinc-800/80">
                                <Row label="Last run">{scheduler.lastRunAt ? `${formatDateTime(scheduler.lastRunAt)} (${formatRelative(scheduler.lastRunAt)})` : 'Not recorded yet'}</Row>
                                {scheduler.lastResult && (
                                    <Row label="Last result">
                                        {scheduler.lastResult.showsCreated} shows over {scheduler.lastResult.daysScheduled} day{scheduler.lastResult.daysScheduled === 1 ? '' : 's'}, {scheduler.lastResult.newMovies} new movie{scheduler.lastResult.newMovies === 1 ? '' : 's'}
                                        {scheduler.lastResult.errors.length > 0 && <span className="block text-xs text-red-300">{scheduler.lastResult.errors.join('; ')}</span>}
                                    </Row>
                                )}
                                <Row label="Next run">{formatDateTime(scheduler.nextRunAt)}</Row>
                                <Row label="Scheduled through">{scheduler.scheduledThrough ? `${scheduler.scheduledThrough} (${scheduler.daysAhead} days ahead)` : 'Nothing scheduled'}</Row>
                                <Row label="Popularity history">
                                    {scheduler.popularitySnapshots?.days
                                        ? `${scheduler.popularitySnapshots.days} day${scheduler.popularitySnapshots.days === 1 ? '' : 's'} of TMDB snapshots (latest ${scheduler.popularitySnapshots.latest})`
                                        : 'Starts with the next scheduler run'}
                                </Row>
                            </div>
                        </Panel>

                        <Panel
                            title="Traffic simulator"
                            description="Generates sample customers and bookings while the site has no real users"
                            actions={simulator.enabled && (
                                <button onClick={() => runJob('simulator')} disabled={Boolean(runningJob)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
                                    <FlaskConical className="w-3.5 h-3.5" />{runningJob === 'simulator' ? 'Running…' : 'Run now'}
                                </button>
                            )}
                        >
                            <div className="divide-y divide-zinc-800/80">
                                <Row label="Status">{simulator.enabled ? <Badge tone="warning">On</Badge> : <Badge>Off</Badge>}</Row>
                                <Row label="Last run">{simulator.lastRunAt ? `${formatDateTime(simulator.lastRunAt)} (${formatRelative(simulator.lastRunAt)})` : 'Never'}</Row>
                                <Row label="Simulated customers">{formatNumber(simulator.customers)}</Row>
                                <Row label="Simulated bookings">{formatNumber(simulator.bookings)}</Row>
                            </div>
                            <p className="mt-3 text-xs text-zinc-500">
                                Turn it off with <code className="rounded bg-zinc-800 px-1">SIMULATE_TRAFFIC=false</code> in Vercel, then remove its data with <code className="rounded bg-zinc-800 px-1">npm run purge:simulated -- --apply</code>.
                            </p>
                        </Panel>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                        <Panel title="Data" actions={<Database className="w-4 h-4 text-zinc-600" />}>
                            <div className="divide-y divide-zinc-800/80">
                                <Row label="Movies">{formatNumber(data.data.movies)}</Row>
                                <Row label="Shows">{formatNumber(data.data.shows)}</Row>
                                <Row label="Bookings">{formatNumber(data.data.bookings)}</Row>
                                <Row label="Customers">{formatNumber(data.data.customers)}</Row>
                            </div>
                        </Panel>
                        <Panel title="Server" actions={<Server className="w-4 h-4 text-zinc-600" />}>
                            <div className="divide-y divide-zinc-800/80">
                                <Row label="Region">{data.environment.region}</Row>
                                <Row label="Node.js">{data.environment.node}</Row>
                                <Row label="Deployed commit">{data.environment.commit ? <code className="text-xs">{data.environment.commit}</code> : 'Local'}</Row>
                            </div>
                        </Panel>
                    </div>
                </div>
            )}
        </>
    );
};

export default SystemStatus;
