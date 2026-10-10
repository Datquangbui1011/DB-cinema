import { useMemo } from 'react';
import { formatTime, posterUrl } from '../../lib/adminFormat';
import { getTheaterType } from '../../lib/theaterTypes';

/**
 * Every film playing on the selected day, each with all of its showtimes.
 * Clicking a showtime opens its details.
 */
const FilmSchedule = ({ shows, screenNames, now, onSelectShow }) => {
    const films = useMemo(() => {
        const byMovie = new Map();
        shows.forEach(show => {
            if (!byMovie.has(show.movieId)) {
                byMovie.set(show.movieId, { movieId: show.movieId, title: show.title, poster_path: show.poster_path, runtime: show.runtime, shows: [] });
            }
            byMovie.get(show.movieId).shows.push(show);
        });
        return [...byMovie.values()]
            .map(f => ({
                ...f,
                shows: f.shows.sort((a, b) => a.start - b.start),
                seatsSold: f.shows.reduce((sum, s) => sum + s.seatsSold, 0),
                capacity: f.shows.reduce((sum, s) => sum + s.capacity, 0),
            }))
            .sort((a, b) => b.seatsSold - a.seatsSold);
    }, [shows]);

    return (
        <div className="grid gap-3 lg:grid-cols-2">
            {films.map(film => (
                <div key={film.movieId} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                        {posterUrl(film.poster_path) && (
                            <img src={posterUrl(film.poster_path, 'w92')} alt="" className="h-full w-full object-cover" onError={e => e.currentTarget.remove()} />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-medium text-zinc-100" title={film.title}>{film.title}</p>
                            <span className="flex-shrink-0 text-[11px] tabular-nums text-zinc-500">
                                {film.shows.length} shows · {film.seatsSold}/{film.capacity} sold
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">{film.runtime} min</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {film.shows.map(show => {
                                const room = getTheaterType(show.theaterType);
                                const done = show.end <= now;
                                const live = show.start <= now && now < show.end;
                                return (
                                    <button
                                        key={show.id}
                                        onClick={() => onSelectShow(show.id)}
                                        title={`${screenNames[show.screen] || 'No screen'} · ${room.name}\n${show.seatsSold}/${show.capacity} seats sold`}
                                        className={`rounded-md border px-2 py-1 text-left transition-colors hover:border-zinc-500 ${done ? 'opacity-40' : ''} ${live ? 'ring-1 ring-emerald-400/70' : ''}`}
                                        style={{ borderColor: `${room.color}55`, background: `${room.color}14` }}
                                    >
                                        <span className="block text-xs font-medium tabular-nums text-zinc-100">{formatTime(show.start)}</span>
                                        <span className="block text-[10px] text-zinc-400">
                                            {screenNames[show.screen] ? screenNames[show.screen].replace('Screen ', 'S') : '—'} · {show.seatsSold}/{show.capacity}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default FilmSchedule;
