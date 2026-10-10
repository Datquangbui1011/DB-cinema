import { useCallback, useEffect, useState } from 'react';
import { Pencil, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Badge, Drawer, Skeleton, ConfirmDialog } from '../../components/admin/ui';
import { getTheaterType, formatPremium } from '../../lib/theaterTypes';
import { formatNumber } from '../../lib/adminFormat';

const inputClass = 'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600';

const ScreenEditor = ({ screen, rooms, onClose, onSaved }) => {
    const { axios, getToken } = useAppContext();
    const [name, setName] = useState(screen.name);
    const [theaterType, setTheaterType] = useState(screen.theaterType);
    const [saving, setSaving] = useState(false);
    const unsold = screen.upcomingShows - screen.upcomingWithSales;

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await axios.patch(`/api/admin/screens/${screen.id}`, { name, theaterType }, { headers: { Authorization: `Bearer ${await getToken()}` } });
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) onSaved();
        } catch (error) {
            console.error(error);
            toast.error('Could not save the screen');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Drawer
            title={`Edit ${screen.name}`}
            onClose={onClose}
            footer={(
                <>
                    <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">Cancel</button>
                    <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dull disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
                </>
            )}
        >
            <div className="space-y-5">
                <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-300">Name</span>
                    <input value={name} onChange={e => setName(e.target.value)} maxLength={40} className={inputClass} />
                </label>
                <div>
                    <span className="mb-1.5 block text-xs font-medium text-zinc-300">Room type</span>
                    <div className="grid grid-cols-2 gap-2">
                        {rooms.map(r => {
                            const type = getTheaterType(r);
                            const Icon = type.icon;
                            return (
                                <button
                                    key={r}
                                    onClick={() => setTheaterType(r)}
                                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${theaterType === r ? 'border-primary bg-primary/10 text-zinc-50' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'}`}
                                >
                                    <Icon className={`w-4 h-4 ${type.text}`} />
                                    <span className="flex-1">{type.name}</span>
                                    <span className="text-[11px] text-zinc-500">{formatPremium(type.premium)}</span>
                                </button>
                            );
                        })}
                    </div>
                    {theaterType !== screen.theaterType && (
                        <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-300">
                            {unsold} upcoming show{unsold === 1 ? '' : 's'} with no tickets sold will switch to {theaterType}.
                            {screen.upcomingWithSales > 0 && ` ${screen.upcomingWithSales} with tickets sold keep ${screen.theaterType}, since customers paid for that room.`}
                        </p>
                    )}
                </div>
                <p className="text-xs text-zinc-500">Seats: {screen.capacity}. Every screen uses the same 10-row seat map today.</p>
            </div>
        </Drawer>
    );
};

const Screens = () => {
    const { axios, getToken, adminRole } = useAppContext();
    const isAdmin = adminRole === 'admin';
    const [data, setData] = useState(null);
    const [editing, setEditing] = useState(null);
    const [toggling, setToggling] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/admin/screens-admin', { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load screens');
        }
    }, [axios, getToken]);

    useEffect(() => { load(); }, [load]);

    const confirmToggle = async () => {
        setBusy(true);
        try {
            const { data } = await axios.patch(`/api/admin/screens/${toggling.id}`, { active: !toggling.active }, { headers: { Authorization: `Bearer ${await getToken()}` } });
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) { setToggling(null); load(); }
        } catch (error) {
            console.error(error);
            toast.error('Could not update the screen');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeader title="Screens" description="The cinema's auditoriums. Each screen's room type sets its ticket upgrade price and which shows the scheduler puts there." />

            {!data ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.screens.map(screen => {
                        const type = getTheaterType(screen.theaterType);
                        const Icon = type.icon;
                        return (
                            <div key={screen.id} className={`rounded-xl border bg-zinc-900/60 p-4 ${screen.active ? 'border-zinc-800' : 'border-zinc-800 opacity-60'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="rounded-lg border border-zinc-800 bg-zinc-950 p-2"><Icon className={`w-5 h-5 ${type.text}`} /></span>
                                        <div>
                                            <p className="font-semibold text-zinc-100">{screen.name}</p>
                                            <p className={`text-xs ${type.text}`}>{type.name} · {formatPremium(type.premium)}</p>
                                        </div>
                                    </div>
                                    {screen.active ? <Badge tone="success">Open</Badge> : <Badge>Closed</Badge>}
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-lg bg-zinc-800/50 py-2">
                                        <p className="text-sm font-semibold tabular-nums text-zinc-100">{screen.capacity}</p>
                                        <p className="text-[10px] text-zinc-500">Seats</p>
                                    </div>
                                    <div className="rounded-lg bg-zinc-800/50 py-2">
                                        <p className="text-sm font-semibold tabular-nums text-zinc-100">{formatNumber(screen.upcomingShows)}</p>
                                        <p className="text-[10px] text-zinc-500">Upcoming shows</p>
                                    </div>
                                    <div className="rounded-lg bg-zinc-800/50 py-2">
                                        <p className="text-sm font-semibold tabular-nums text-zinc-100">{formatNumber(screen.upcomingWithSales)}</p>
                                        <p className="text-[10px] text-zinc-500">With tickets sold</p>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="mt-3 flex justify-end gap-1">
                                        <button onClick={() => setEditing(screen)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"><Pencil className="w-3.5 h-3.5" />Edit</button>
                                        <button onClick={() => setToggling(screen)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${screen.active ? 'text-zinc-300 hover:bg-red-500/10 hover:text-red-400' : 'text-emerald-400 hover:bg-emerald-500/10'}`}>
                                            <Power className="w-3.5 h-3.5" />{screen.active ? 'Close' : 'Reopen'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {editing && <ScreenEditor screen={editing} rooms={data.rooms} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}

            {toggling && (
                <ConfirmDialog
                    title={toggling.active ? `Close ${toggling.name}?` : `Reopen ${toggling.name}?`}
                    message={toggling.active
                        ? `The scheduler will stop adding shows to ${toggling.name}. Its ${toggling.upcomingShows} upcoming show${toggling.upcomingShows === 1 ? '' : 's'} stay until you cancel them on the Shows page.`
                        : `${toggling.name} will get new shows from the next scheduler run.`}
                    confirmLabel={toggling.active ? 'Close screen' : 'Reopen screen'}
                    danger={toggling.active}
                    busy={busy}
                    onConfirm={confirmToggle}
                    onCancel={() => setToggling(null)}
                />
            )}
        </>
    );
};

export default Screens;
