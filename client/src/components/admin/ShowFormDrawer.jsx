import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { getTheaterType, formatPremium } from '../../lib/theaterTypes';
import { formatMoney, posterUrl } from '../../lib/adminFormat';

const CINEMA_TIMEZONE = 'America/Chicago';
const toLocalDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });
const toLocalTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', minute: '2-digit' });

const Field = ({ label, hint, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-300">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
);

// Explains how the screen's room type changes the ticket price
const roomHint = (room) => {
    if (!room) return 'Times that overlap another show on this screen are refused.';
    if (room.premium === 0) return `${room.name} room: no upgrade charge.`;
    return room.premium > 0
        ? `${room.name} room: ${formatPremium(room.premium)} per ticket on top of the base price.`
        : `${room.name} room: ${formatPremium(room.premium)} per ticket off the base price.`;
};

const inputClass = 'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-50';

/**
 * Side panel to add shows (one movie, one screen, several times) or edit one
 * show. `show` is a row from the shows table when editing, otherwise null.
 */
const ShowFormDrawer = ({ show, movies, screens, onClose, onSaved }) => {
    const { axios, getToken } = useAppContext();
    const editing = Boolean(show);
    const locked = editing && show.seatsSold > 0;

    const [movieId, setMovieId] = useState(show?.movieId || '');
    const [movieQuery, setMovieQuery] = useState('');
    const [nowPlaying, setNowPlaying] = useState([]);
    const [screenId, setScreenId] = useState(show?.screenId || '');
    const [date, setDate] = useState(show ? toLocalDate(show.start) : toLocalDate(Date.now() + 86_400_000));
    const [time, setTime] = useState(show ? toLocalTime(show.start) : '19:00');
    const [times, setTimes] = useState([]);
    // A promoted show is edited at its regular price; the promotion only ends if that changes
    const promo = show?.promotion?.percent ? show.promotion : null;
    const regularPrice = promo ? promo.originalPrice : show?.showPrice;
    const [price, setPrice] = useState(regularPrice ?? 12);
    const [saving, setSaving] = useState(false);

    // New shows can also use movies now playing on TMDB that aren't scheduled yet
    useEffect(() => {
        if (editing) return;
        (async () => {
            try {
                const { data } = await axios.get('/api/shows/now-playing', { headers: { Authorization: `Bearer ${await getToken()}` } });
                if (data.success) setNowPlaying(data.movies.map(m => ({ id: String(m.id), title: m.title, poster_path: m.poster_path })));
            } catch { /* scheduled movies are still available */ }
        })();
    }, [axios, getToken, editing]);

    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const movieOptions = useMemo(() => {
        const all = new Map(movies.map(m => [m.id, m]));
        nowPlaying.forEach(m => all.has(m.id) || all.set(m.id, m));
        const q = movieQuery.trim().toLowerCase();
        return [...all.values()].filter(m => !q || m.title.toLowerCase().includes(q)).slice(0, 40);
    }, [movies, nowPlaying, movieQuery]);

    const selectedMovie = movies.find(m => m.id === movieId) || nowPlaying.find(m => m.id === movieId);
    const selectedScreen = screens.find(s => s.id === screenId);
    const room = selectedScreen ? getTheaterType(selectedScreen.theaterType) : null;

    const addTime = () => {
        if (time && !times.includes(time)) setTimes([...times, time].sort());
    };

    const submit = async () => {
        if (!editing && (!movieId || !screenId || times.length === 0)) {
            return toast.error('Pick a movie, a screen and at least one time');
        }
        setSaving(true);
        try {
            const headers = { Authorization: `Bearer ${await getToken()}` };
            const { data } = editing
                ? await axios.patch(`/api/admin/shows/${show.id}`, {
                    ...(locked ? {} : { date, time, screenId }),
                    ...(Number(price) !== regularPrice ? { showPrice: Number(price) } : {}),
                }, { headers })
                : await axios.post('/api/shows/add', { movieId, screenId, showPrice: Number(price), showInput: [{ date, time: times }] }, { headers });
            if (data.success) {
                toast.success(data.message);
                onSaved();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Could not save the show');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
            <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-100">{editing ? 'Edit show' : 'Add shows'}</h2>
                        <p className="text-xs text-zinc-500">{editing ? show.title : 'Times are in Central time'}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close">
                        <X className="w-4 h-4" />
                    </button>
                </header>

                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                    {locked && (
                        <p className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                            <Lock className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
                            {show.seatsSold} tickets are sold, so the time and screen are locked. You can still change the price for future sales.
                        </p>
                    )}

                    {!editing && (
                        <Field label="Movie">
                            <input value={movieQuery} onChange={e => setMovieQuery(e.target.value)} placeholder="Search movies…" className={inputClass} />
                            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-1">
                                {movieOptions.map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setMovieId(m.id)}
                                        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${movieId === m.id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900'}`}
                                    >
                                        <span className="h-9 w-6 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                                            {posterUrl(m.poster_path) && <img src={posterUrl(m.poster_path, 'w92')} alt="" className="h-full w-full object-cover" />}
                                        </span>
                                        <span className="truncate">{m.title}</span>
                                    </button>
                                ))}
                                {movieOptions.length === 0 && <p className="px-2 py-3 text-xs text-zinc-500">No movies match.</p>}
                            </div>
                            {selectedMovie && <span className="mt-1 block text-[11px] text-zinc-400">Selected: {selectedMovie.title}</span>}
                        </Field>
                    )}

                    <Field label="Screen" hint={roomHint(room)}>
                        <select value={screenId || ''} onChange={e => setScreenId(e.target.value)} disabled={locked} className={inputClass}>
                            <option value="" disabled>Choose a screen</option>
                            {screens.filter(s => s.active).map(s => (
                                <option key={s.id} value={s.id}>{s.name} · {s.theaterType}</option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Date">
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={locked} className={inputClass} />
                        </Field>
                        <Field label="Start time">
                            <input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={locked} className={inputClass} />
                        </Field>
                    </div>

                    {!editing && (
                        <div>
                            <button type="button" onClick={addTime} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900">
                                <Plus className="w-3.5 h-3.5" />Add {time || 'time'} on {date}
                            </button>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {times.map(t => (
                                    <span key={t} className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs tabular-nums text-zinc-100">
                                        {t}
                                        <button type="button" onClick={() => setTimes(times.filter(x => x !== t))} className="text-zinc-500 hover:text-red-400" aria-label={`Remove ${t}`}>
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                                {times.length === 0 && <span className="text-[11px] text-zinc-500">No times added yet.</span>}
                            </div>
                        </div>
                    )}

                    <Field
                        label="Base ticket price"
                        hint={promo
                            ? `On a ${promo.percent}% promotion: customers currently pay ${formatMoney(show.showPrice + (room?.premium || 0))}. Changing this price ends the promotion.`
                            : room ? `Customers pay ${formatMoney(Number(price || 0) + room.premium)} in ${room.name}.` : undefined}
                    >
                        <input type="number" min="1" step="0.5" value={price} onChange={e => setPrice(e.target.value)} className={inputClass} />
                    </Field>
                </div>

                <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
                    <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">Cancel</button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dull disabled:opacity-60"
                    >
                        {saving ? 'Saving…' : editing ? 'Save changes' : `Add ${times.length || ''} show${times.length === 1 ? '' : 's'}`}
                    </button>
                </footer>
            </aside>
        </div>
    );
};

export default ShowFormDrawer;
