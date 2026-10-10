import { useEffect, useRef } from 'react';
import { CalendarDays } from 'lucide-react';

const parseDate = (date) => new Date(`${date}T12:00:00`);

/**
 * Horizontal strip of days (past week through the last scheduled day) with
 * each day's show count and occupancy, plus a picker for any other date.
 */
const ScheduleCalendar = ({ days, today, value, onChange }) => {
    const selectedRef = useRef(null);

    // Keep the selected day in view when the strip loads or the date changes
    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, [value, days.length]);

    return (
        <div className="flex items-stretch gap-3">
            <div className="flex flex-1 gap-1.5 overflow-x-auto pb-2 no-scrollbar">
                {days.map(day => {
                    const d = parseDate(day.date);
                    const selected = day.date === value;
                    const isToday = day.date === today;
                    const past = day.date < today;
                    return (
                        <button
                            key={day.date}
                            ref={selected ? selectedRef : null}
                            onClick={() => onChange(day.date)}
                            className={`flex w-[68px] flex-shrink-0 flex-col items-center rounded-lg border px-2 py-2 transition-colors ${selected
                                ? 'border-primary bg-primary/15'
                                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                                } ${past && !selected ? 'opacity-60' : ''}`}
                        >
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-zinc-500'}`}>
                                {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                            <span className="text-lg font-semibold leading-tight text-zinc-100 tabular-nums">{d.getDate()}</span>
                            <span className="text-[10px] text-zinc-500">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                            <span className={`mt-1 text-[10px] tabular-nums ${day.shows ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                {day.shows ? `${day.shows} shows` : 'No shows'}
                            </span>
                            <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(day.occupancy * 100)}%` }} />
                            </span>
                        </button>
                    );
                })}
            </div>
            <label className="flex flex-shrink-0 flex-col justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-[10px] uppercase tracking-wider text-zinc-500">
                <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />Jump to</span>
                <input
                    type="date"
                    value={value}
                    onChange={e => e.target.value && onChange(e.target.value)}
                    className="bg-transparent text-xs normal-case tracking-normal text-zinc-100 outline-none"
                />
            </label>
        </div>
    );
};

export default ScheduleCalendar;
