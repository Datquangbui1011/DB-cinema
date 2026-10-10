import { useEffect, useState } from 'react';
import { X, Clock, Users, DollarSign, Ticket, XCircle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { Badge, EmptyState, ProgressBar, Skeleton } from './ui';
import { formatDateTime, formatMoney, formatTime, posterUrl } from '../../lib/adminFormat';
import { getTheaterType } from '../../lib/theaterTypes';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = 9;

// Small seat map: filled squares are sold seats
const SeatMap = ({ occupied, color }) => {
    const taken = new Set(occupied);
    return (
        <div className="inline-flex flex-col gap-1">
            <div className="mb-1 h-1 rounded-full bg-zinc-600" title="Screen" />
            {ROWS.map(row => (
                <div key={row} className="flex items-center gap-1">
                    <span className="w-3 text-[9px] text-zinc-500">{row}</span>
                    {Array.from({ length: SEATS_PER_ROW }, (_, i) => {
                        const seat = `${row}${i + 1}`;
                        return (
                            <span
                                key={seat}
                                title={seat}
                                className="h-3 w-3 rounded-sm border"
                                style={taken.has(seat)
                                    ? { background: color, borderColor: color }
                                    : { borderColor: '#3f3f46' }}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

/** Pop-up with one show's details and every booking for it */
const ShowDetailsDialog = ({ showId, onClose }) => {
    const { axios, getToken } = useAppContext();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);
        (async () => {
            try {
                const { data } = await axios.get(`/api/admin/shows/${showId}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
                if (cancelled) return;
                data.success ? setData(data) : setError(data.message);
            } catch {
                if (!cancelled) setError('Could not load this show');
            }
        })();
        return () => { cancelled = true; };
    }, [axios, getToken, showId]);

    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const show = data?.show;
    const room = show ? getTheaterType(show.theaterType) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
                    <h2 className="text-sm font-semibold text-zinc-100">Show details</h2>
                    <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto p-5">
                    {error ? (
                        <EmptyState icon={XCircle} title={error} />
                    ) : !data ? (
                        <Skeleton className="h-80 w-full" />
                    ) : (
                        <>
                            <div className="flex gap-4">
                                {posterUrl(show.movie?.poster_path)
                                    ? <img src={posterUrl(show.movie.poster_path, 'w154')} alt="" className="h-36 w-24 flex-shrink-0 rounded-lg object-cover" />
                                    : <div className="h-36 w-24 flex-shrink-0 rounded-lg bg-zinc-800" />}
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-lg font-semibold text-zinc-50">{show.movie?.title || 'Removed movie'}</h3>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge className={room.badge}>{room.name}</Badge>
                                        {show.screen && <Badge>{show.screen.name}</Badge>}
                                        <Badge>{formatMoney(show.ticketPrice)} / ticket</Badge>
                                    </div>
                                    <p className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                                        <Clock className="w-4 h-4 text-zinc-500" />
                                        {formatDateTime(show.start)} – {formatTime(show.end)}
                                        <span className="text-zinc-500">({show.movie?.runtime || '?'} min)</span>
                                    </p>
                                    <div className="mt-4 max-w-sm">
                                        <div className="mb-1 flex justify-between text-xs text-zinc-400">
                                            <span>{show.seatsSold} of {show.capacity} seats sold</span>
                                            <span className="tabular-nums">{Math.round((show.seatsSold / show.capacity) * 100)}%</span>
                                        </div>
                                        <ProgressBar value={show.seatsSold / show.capacity} color="bg-emerald-500" />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 grid grid-cols-3 gap-2">
                                <div className="rounded-lg bg-zinc-900 px-3 py-2.5">
                                    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500"><DollarSign className="w-3 h-3" />Revenue</p>
                                    <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-100">{formatMoney(data.totals.revenue)}</p>
                                </div>
                                <div className="rounded-lg bg-zinc-900 px-3 py-2.5">
                                    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Ticket className="w-3 h-3" />Paid bookings</p>
                                    <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-100">{data.totals.bookings}</p>
                                </div>
                                <div className="rounded-lg bg-zinc-900 px-3 py-2.5">
                                    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Users className="w-3 h-3" />Abandoned checkouts</p>
                                    <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-100">{data.totals.abandoned}</p>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-col gap-5 md:flex-row">
                                <div className="flex-shrink-0">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Seat map</p>
                                    <SeatMap occupied={show.occupiedSeats} color={room.color} />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Bookings ({data.bookings.length})</p>
                                    {data.bookings.length === 0 ? (
                                        <EmptyState icon={Ticket} title="No bookings yet" />
                                    ) : (
                                        <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800">
                                            <table className="w-full text-xs">
                                                <thead className="sticky top-0 bg-zinc-900">
                                                    <tr className="text-left text-zinc-500">
                                                        <th className="px-3 py-2 font-medium">Customer</th>
                                                        <th className="px-3 py-2 font-medium">Seats</th>
                                                        <th className="px-3 py-2 font-medium text-right">Amount</th>
                                                        <th className="px-3 py-2 font-medium text-right">Booked</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.bookings.map(b => (
                                                        <tr key={b.id} className={`border-t border-zinc-800/70 ${b.isPaid ? '' : 'opacity-50'}`}>
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-center gap-2">
                                                                    {b.customerImage
                                                                        ? <img src={b.customerImage} alt="" className="h-5 w-5 rounded-full" />
                                                                        : <div className="h-5 w-5 rounded-full bg-zinc-800" />}
                                                                    <span className="text-zinc-200">{b.customer}</span>
                                                                    {!b.isPaid && <Badge tone="warning">Unpaid</Badge>}
                                                                    {b.isSimulated && <span className="text-[10px] text-zinc-500" title="Generated by the traffic simulator">sim</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 tabular-nums text-zinc-300">{b.seats.join(', ')}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-zinc-100">{formatMoney(b.amount)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{formatDateTime(b.createdAt)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShowDetailsDialog;
