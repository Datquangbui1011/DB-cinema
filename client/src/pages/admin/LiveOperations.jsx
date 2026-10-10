import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, PlayCircle, Clock, CalendarClock, Ticket, Armchair, Sparkles, MonitorOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, Skeleton, ProgressBar, EmptyState, SegmentedControl } from '../../components/admin/ui';
import { formatMoney, formatNumber, formatPercent, formatTime, posterUrl } from '../../lib/adminFormat';
import { getTheaterType } from '../../lib/theaterTypes';
import ScheduleCalendar from '../../components/admin/ScheduleCalendar';
import FilmSchedule from '../../components/admin/FilmSchedule';
import ShowDetailsDialog from '../../components/admin/ShowDetailsDialog';

const REFRESH_MS = 15_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const STATUS = {
    playing: { label: 'Playing', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400 animate-pulse' },
    starting: { label: 'Starting soon', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', dot: 'bg-sky-400' },
    cleaning: { label: 'Cleaning', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
    idle: { label: 'Idle', className: 'bg-zinc-800 text-zinc-400 border-zinc-700', dot: 'bg-zinc-500' },
    closed: { label: 'Closed', className: 'bg-zinc-900 text-zinc-500 border-zinc-800', dot: 'bg-zinc-600' },
};

const duration = (ms) => {
    const minutes = Math.max(0, Math.round(ms / MINUTE));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

const StatusPill = ({ status }) => {
    const s = STATUS[status] || STATUS.idle;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${s.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
};

const LiveBadge = ({ updatedAgo }) => (
    <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">
        <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <span className="font-semibold text-zinc-100">LIVE</span>
        <span className="tabular-nums">· updated {updatedAgo}s ago</span>
    </span>
);

const SummaryStat = ({ icon, label, value, accent = 'text-zinc-50' }) => {
    const Icon = icon;
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </div>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${accent}`}>{value}</p>
        </div>
    );
};

// Falls back to a plain tile when there's no poster or the image fails to load
const Poster = ({ path, className }) => (
    <div className={`overflow-hidden rounded bg-zinc-800 ${className}`}>
        {posterUrl(path) && <img src={posterUrl(path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />}
    </div>
);

const ScreenCard = ({ screen, now, dayEnd, onSelectShow }) => {
    const room = getTheaterType(screen.theaterType);
    const { current, next } = screen;
    const nextIsTomorrow = next && next.start >= dayEnd;

    return (
        <div className={`flex flex-col rounded-xl border bg-zinc-900/60 ${screen.status === 'playing' ? 'border-emerald-500/30' : 'border-zinc-800'}`}>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-zinc-100">{screen.name}</span>
                    <span className={`truncate text-[11px] font-medium ${room.text}`}>{room.name}</span>
                </div>
                <StatusPill status={screen.status} />
            </div>

            <div
                className={`flex-1 p-4 ${current || next ? 'cursor-pointer hover:bg-zinc-800/30' : ''}`}
                onClick={() => (current || next) && onSelectShow((current || next).id)}
            >
                {current ? (
                    <>
                        <div className="flex gap-3">
                            <Poster path={current.poster_path} className="h-16 w-11 flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-100" title={current.title}>{current.title}</p>
                                <p className="mt-0.5 text-xs tabular-nums text-zinc-500">{formatTime(current.start)} – {formatTime(current.end)}</p>
                                <p className="mt-1.5 flex items-center gap-1 text-xs text-zinc-400">
                                    <Users className="w-3 h-3" />
                                    <span className="tabular-nums">{current.seatsSold}/{current.capacity}</span> in seats
                                </p>
                            </div>
                        </div>
                        <ProgressBar value={(now - current.start) / (current.end - current.start)} color="bg-emerald-500" className="mt-3" />
                        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-zinc-500">
                            <span>{duration(now - current.start)} in</span>
                            <span>{duration(current.end - now)} left</span>
                        </div>
                    </>
                ) : screen.status === 'cleaning' ? (
                    <div className="flex h-full flex-col justify-center text-sm text-zinc-400">
                        <p className="flex items-center gap-2 text-amber-400"><Sparkles className="w-4 h-4" />Turning over the room</p>
                        <p className="mt-1 text-xs tabular-nums text-zinc-500">Ready in {duration(screen.cleaningUntil - now)}</p>
                    </div>
                ) : next && nextIsTomorrow ? (
                    <div className="flex gap-3">
                        <Poster path={next.poster_path} className="h-16 w-11 flex-shrink-0 opacity-60" />
                        <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Closed · opens tomorrow</p>
                            <p className="truncate text-sm font-medium text-zinc-300" title={next.title}>{next.title}</p>
                            <p className="mt-0.5 text-xs tabular-nums text-zinc-500">First show {formatTime(next.start)}</p>
                        </div>
                    </div>
                ) : next ? (
                    <div className="flex gap-3">
                        <Poster path={next.poster_path} className="h-16 w-11 flex-shrink-0 opacity-80" />
                        <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Up next</p>
                            <p className="truncate text-sm font-medium text-zinc-100" title={next.title}>{next.title}</p>
                            <p className={`mt-0.5 text-xs tabular-nums ${screen.status === 'starting' ? 'text-sky-400' : 'text-zinc-400'}`}>
                                Starts in {duration(next.start - now)} · {formatTime(next.start)}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full items-center gap-2 text-sm text-zinc-500">
                        <MonitorOff className="w-4 h-4" />
                        No more shows today
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 px-4 py-2 text-[11px] text-zinc-500">
                {current && next && !nextIsTomorrow ? (
                    <span className="truncate">Next: <span className="text-zinc-300">{next.title}</span> · {formatTime(next.start)}</span>
                ) : (
                    <span>{screen.showsToday} shows today</span>
                )}
                {next && <span className="flex-shrink-0 tabular-nums">{next.seatsSold}/{next.capacity} sold</span>}
            </div>
        </div>
    );
};

const Timeline = ({ lanes, now, dayStart, onSelectShow }) => { // dayStart: midnight of the day shown
    // Show 9 AM to 1 AM, widened if today's shows fall outside that window.
    // Last night's late shows still running after midnight are clipped at the left edge.
    const allShows = lanes.flatMap(l => l.shows);
    const todayStarts = allShows.filter(s => s.start >= dayStart).map(s => Math.floor(s.start / HOUR) * HOUR);
    const from = Math.min(dayStart + 9 * HOUR, ...todayStarts);
    const to = Math.max(dayStart + 25 * HOUR, ...allShows.map(s => Math.ceil(s.end / HOUR) * HOUR));
    const span = to - from;
    const pct = (t) => `${((t - from) / span) * 100}%`;
    const hours = Array.from({ length: Math.round(span / HOUR) + 1 }, (_, i) => from + i * HOUR);
    const nowVisible = now >= from && now <= to;

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
                {/* Hour axis */}
                <div className="relative ml-36 h-6 border-b border-zinc-800">
                    {hours.map(h => (
                        <span key={h} className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500" style={{ left: pct(h) }}>
                            {formatTime(h).replace(':00', '')}
                        </span>
                    ))}
                </div>

                <div className="relative">
                    {lanes.map(lane => (
                        <div key={lane.id} className="flex h-11 items-center border-b border-zinc-800/60 last:border-0">
                            <div className="w-36 flex-shrink-0 pr-3">
                                <p className="truncate text-xs font-medium text-zinc-200">{lane.name}</p>
                                <p className={`truncate text-[10px] ${lane.room ? getTheaterType(lane.room).text : 'text-zinc-500'}`}>{lane.room || 'No screen assigned'}</p>
                            </div>
                            <div className="relative h-8 flex-1">
                                {hours.map(h => <div key={h} className="absolute inset-y-0 border-l border-zinc-800/50" style={{ left: pct(h) }} />)}
                                {lane.shows.filter(show => show.end > from).map(show => {
                                    const room = getTheaterType(show.theaterType);
                                    const left = Math.max(show.start, from);
                                    const live = show.start <= now && now < show.end;
                                    const done = show.end <= now;
                                    return (
                                        <button
                                            key={show.id}
                                            onClick={() => onSelectShow(show.id)}
                                            title={`${show.title}\n${formatTime(show.start)} – ${formatTime(show.end)}\n${show.seatsSold}/${show.capacity} seats sold`}
                                            className={`absolute inset-y-0.5 overflow-hidden rounded-md border px-2 py-0.5 text-left text-[10px] leading-tight hover:brightness-150 ${live ? 'ring-1 ring-emerald-400/70' : ''} ${done ? 'opacity-35' : ''}`}
                                            style={{
                                                left: pct(left),
                                                width: `calc(${((Math.min(show.end, to) - left) / span) * 100}% - 2px)`,
                                                background: `${room.color}26`,
                                                borderColor: `${room.color}66`,
                                            }}
                                        >
                                            <p className="truncate font-medium text-zinc-100">{show.title}</p>
                                            <p className="truncate tabular-nums text-zinc-400">{formatTime(show.start)} · {show.seatsSold}/{show.capacity}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Now line */}
                    {nowVisible && (
                        <div className="pointer-events-none absolute inset-y-0 ml-36" style={{ left: 0, right: 0 }}>
                            <div className="absolute inset-y-0 w-px bg-red-500" style={{ left: pct(now) }}>
                                <span className="absolute -top-1 -translate-x-1/2 rounded bg-red-500 px-1 text-[9px] font-semibold text-white">NOW</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const VIEW_OPTIONS = [{ value: 'timeline', label: 'Timeline' }, { value: 'films', label: 'Films' }];
const CALENDAR_REFRESH_MS = 5 * 60_000;

const LiveOperations = () => {
    const { axios, getToken } = useAppContext();
    const [date, setDate] = useState(null);           // null = today (per the server)
    const [scheduleView, setScheduleView] = useState('timeline');
    const [calendar, setCalendar] = useState(null);
    const [selectedShowId, setSelectedShowId] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [clockOffset, setClockOffset] = useState(0);
    const [receivedAt, setReceivedAt] = useState(Date.now());
    const [tick, setTick] = useState(Date.now());

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get(`/api/admin/live${date ? `?date=${date}` : ''}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) {
                setData(data);
                // Use the server's clock so progress bars agree with the schedule
                setClockOffset(data.now - Date.now());
                setReceivedAt(Date.now());
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Could not load live operations');
        } finally {
            setLoading(false);
        }
    }, [axios, getToken, date]);

    const loadCalendar = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/admin/schedule-calendar', { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) setCalendar(data);
        } catch (error) {
            console.error(error);
        }
    }, [axios, getToken]);

    useEffect(() => {
        loadCalendar();
        const refresh = setInterval(loadCalendar, CALENDAR_REFRESH_MS);
        return () => clearInterval(refresh);
    }, [loadCalendar]);

    useEffect(() => {
        load();
        const refresh = setInterval(load, REFRESH_MS);
        const clock = setInterval(() => setTick(Date.now()), 1000);
        return () => { clearInterval(refresh); clearInterval(clock); };
    }, [load]);

    const now = tick + clockOffset;

    const lanes = useMemo(() => {
        if (!data) return [];
        const screenLanes = data.screens.map(s => ({ id: s.id, name: s.name, room: s.theaterType, shows: s.timeline }));
        return data.unassigned.length
            ? [...screenLanes, { id: 'unassigned', name: 'Unassigned', room: null, shows: data.unassigned }]
            : screenLanes;
    }, [data]);

    const summary = data?.summary;
    const selectedDate = date || data?.today;
    const viewReady = data && (!date || data.view === date);
    const screenNames = useMemo(() => Object.fromEntries((data?.screens || []).map(s => [s.id, s.name])), [data]);
    const dayShows = useMemo(() => lanes.flatMap(l => l.shows).filter(s => s.start >= (data?.viewStart || 0)), [lanes, data]);
    const dayLabel = selectedDate
        ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : '';

    return (
        <>
            <PageHeader
                title="Live Operations"
                description="What every screen is doing right now, refreshed every 15 seconds."
                actions={data && <LiveBadge updatedAgo={Math.max(0, Math.round((tick - receivedAt) / 1000))} />}
            />

            {loading ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[70px]" />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <SummaryStat icon={PlayCircle} label="Playing now" value={`${summary.playingNow} / ${data.screens.length}`} accent="text-emerald-400" />
                    <SummaryStat icon={Users} label="Guests in seats" value={formatNumber(summary.guestsInSeats)} />
                    <SummaryStat icon={Clock} label="Starting next hour" value={summary.startingNextHour} />
                    <SummaryStat icon={CalendarClock} label="Shows left today" value={`${summary.showsLeftToday} of ${summary.showsToday}`} />
                    <SummaryStat icon={Ticket} label="Sold today" value={`${formatNumber(summary.ticketsSoldToday)} · ${formatMoney(summary.revenueToday, { compact: true })}`} />
                    <SummaryStat icon={Armchair} label="Occupancy today" value={formatPercent(summary.occupancyToday, 1)} />
                </div>
            )}

            <h2 className="mt-8 mb-3 text-sm font-semibold text-zinc-200">Screens</h2>
            {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-44" />)}
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {data.screens.map(screen => <ScreenCard key={screen.id} screen={screen} now={now} dayEnd={data.dayEnd} onSelectShow={setSelectedShowId} />)}
                </div>
            )}

            <Panel
                className="mt-8"
                title="Schedule"
                description={dayLabel ? `${dayLabel}${selectedDate === data?.today ? ' (today)' : ''} · ${dayShows.length} shows. Click any show to see its bookings.` : 'Pick a day to see every show.'}
                actions={<SegmentedControl options={VIEW_OPTIONS} value={scheduleView} onChange={setScheduleView} />}
                bodyClassName="p-4"
            >
                {calendar && selectedDate && (
                    <div className="mb-4">
                        <ScheduleCalendar days={calendar.days} today={calendar.today} value={selectedDate} onChange={setDate} />
                    </div>
                )}
                {loading || !viewReady ? <Skeleton className="h-96 w-full" /> : dayShows.length === 0 && lanes.every(l => l.shows.length === 0) ? (
                    <EmptyState icon={CalendarClock} title="No shows scheduled on this day" description="Shows are added automatically each night for the next 14 days." />
                ) : scheduleView === 'timeline' ? (
                    <Timeline lanes={lanes} now={now} dayStart={data.viewStart} onSelectShow={setSelectedShowId} />
                ) : (
                    <FilmSchedule shows={dayShows} screenNames={screenNames} now={now} onSelectShow={setSelectedShowId} />
                )}
            </Panel>

            {selectedShowId && <ShowDetailsDialog showId={selectedShowId} onClose={() => setSelectedShowId(null)} />}
        </>
    );
};

export default LiveOperations;
