/**
 * Business rules that turn demand forecasts into recommendations. Pure
 * functions over data runAdvisor has already loaded; nothing here writes to
 * the database. Applying an option re-checks everything (advisor/apply.js).
 *
 * Every candidate: { show, type, priority, title, reason, assumptions,
 *                    options: [{ id, label, impact: { revenue, tickets }, params }], prediction }
 */
import { ADVISOR, ASSUMPTIONS, PREMIUM_UPGRADE_ROOMS } from './advisorConfig.js';
import { CLEANING_MINUTES, hoursFor } from '../configs/screens.js';
import { theaterPremiums } from '../configs/theaterTypes.js';
import { toCinemaDate, zonedTimeToUtc, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { allowedIn, isFamilyFriendly } from '../scheduler/screenPlanner.js';
import { slotOf } from '../ml/features.js';

const MINUTE = 60_000;
const HOUR_MS = 3_600_000;
const DEFAULT_RUNTIME = 120;

const money = (n) => Math.round(n * 100) / 100;
const pct = (x) => `${Math.round(x * 100)}%`;
const priceOf = (show, theaterType = show.theaterType, showPrice = show.showPrice) => showPrice + (theaterPremiums[theaterType] ?? 0);
const localMinutes = (date) => {
    const [h, m] = date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
    return (h % 24) * 60 + m;
};
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const formatShowTime = (date) => date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatTime = (date) => date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: 'numeric', minute: '2-digit' });

export const priorityFor = (impact, hoursUntil) => {
    if (impact >= ADVISOR.highPriorityImpact || (impact > 0 && hoursUntil < ADVISOR.urgentHours)) return 'high';
    if (impact >= ADVISOR.mediumPriorityImpact) return 'medium';
    return 'low';
};

/**
 * @param {object} ctx
 * @param {Date}   ctx.now
 * @param {Array}  ctx.shows        upcoming shows (lean), each with `.movieDoc`
 * @param {Array}  ctx.busyShows    every show that can block a screen in the period (incl. upcoming), with `.runtime`
 * @param {Array}  ctx.screens      active screens
 * @param {Map}    ctx.predictions  showId -> { seats, low, high, occupancy, sold, revenueSoFar }
 * @param {object} ctx.history      createHistory() result, for "this slot usually sells" reasons
 * @param {Function} ctx.forecast   (showLike, seatsSoldNow) -> { seats, low, high, occupancy }
 */
export const generateRecommendations = (ctx) => {
    const blocksByScreen = new Map();
    for (const s of ctx.busyShows) {
        const start = s.showDateTime.getTime();
        const end = start + ((s.runtime || DEFAULT_RUNTIME) + CLEANING_MINUTES) * MINUTE;
        if (!blocksByScreen.has(s.screen)) blocksByScreen.set(s.screen, []);
        blocksByScreen.get(s.screen).push([start, end, String(s._id)]);
    }
    const showsByMovie = new Map();
    for (const s of ctx.shows) {
        if (!showsByMovie.has(String(s.movie))) showsByMovie.set(String(s.movie), []);
        showsByMovie.get(String(s.movie)).push(s);
    }

    const helpers = {
        ...ctx,
        // A screen is free if the new show (runtime + cleaning) overlaps nothing on it,
        // ignoring `replacingShowId` (a show that would be cancelled to make room)
        isFree(screenId, start, runtime, replacingShowId = null) {
            const s = start.getTime(), e = s + (runtime + CLEANING_MINUTES) * MINUTE;
            return !(blocksByScreen.get(screenId) || []).some(([bs, be, id]) => id !== replacingShowId && s < be && bs < e);
        },
        withinHours(theaterType, start) {
            const minutes = localMinutes(start), hours = hoursFor(theaterType);
            return minutes >= hours.open && minutes <= hours.lastStart;
        },
        sameMovieShows: (movieId) => showsByMovie.get(String(movieId)) || [],
        screenById: new Map(ctx.screens.map(sc => [sc._id, sc])),
        slotAverage: (show) => ctx.history.slot(slotOf(show), ctx.now),
    };

    const out = [];
    for (const show of ctx.shows) {
        const p = ctx.predictions.get(String(show._id));
        if (!p || !show.movieDoc) continue;
        for (const rule of [addShowtime, upgradeRoom, promotion, cancel]) {
            const rec = rule(show, p, helpers);
            if (!rec) continue;
            rec.options = rec.options.filter(o => o.impact.revenue >= ADVISOR.minImpact);
            if (rec.options.length) out.push({ ...rec, show: String(show._id), assumptions: ASSUMPTIONS[rec.type] });
        }
    }
    return out;
};

const describe = (show, p, h) => {
    const hours = (show.showDateTime - h.now) / HOUR_MS;
    const toGo = hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.round(hours)}h`;
    const slot = h.slotAverage(show);
    return [
        `Forecast ${pct(p.occupancy)} full (likely ${Math.round(p.low)}-${Math.round(p.high)} of ${show.capacity || 90} seats)`,
        `${p.sold} sold with ${toGo} to go`,
        slot >= 0 ? `${show.theaterType} ${formatTime(show.showDateTime)} slots on this weekday usually sell ${pct(slot)}` : null,
    ].filter(Boolean).join(' · ');
};

const movieForRooms = (movie) => ({ family: isFamilyFriendly((movie.genres || []).map(g => g.id)) });

// Forecast to sell out: add another showing of the same film nearby
const addShowtime = (show, p, h) => {
    if (p.occupancy < ADVISOR.sellOutThreshold) return null;
    const movie = show.movieDoc;
    const runtime = movie.runtime || DEFAULT_RUNTIME;
    const roomMovie = movieForRooms(movie);
    const others = h.sameMovieShows(show.movie).map(s => s.showDateTime.getTime());
    const date = toCinemaDate(show.showDateTime);
    const center = localMinutes(show.showDateTime);
    const window = ADVISOR.addShowWindowHours * 60;
    const step = ADVISOR.slotStepMinutes;

    const candidates = [];
    for (let m = Math.ceil((center - window) / step) * step; m <= center + window; m += step) {
        if (m < 0 || m >= 24 * 60) continue;
        const start = zonedTimeToUtc(date, hhmm(m));
        if (start - h.now < ADVISOR.addShowMinHoursAhead * HOUR_MS) continue;
        if (others.some(t => Math.abs(t - start) < ADVISOR.sameMovieGapMinutes * MINUTE)) continue;
        for (const screen of h.screens) {
            if (!allowedIn(screen.theaterType, roomMovie) || !h.withinHours(screen.theaterType, start)) continue;
            if (!h.isFree(screen._id, start, runtime)) continue;
            const ticketPrice = priceOf(show, screen.theaterType);
            const tickets = Math.round((screen.capacity || 90) * ADVISOR.spillOverShare);
            candidates.push({
                id: `slot-${screen._id}-${date}-${hhmm(m).replace(':', '')}`,
                label: `${screen.name} (${screen.theaterType}) · ${formatTime(start)}`,
                impact: { revenue: money(tickets * ticketPrice), tickets },
                params: { screenId: screen._id, date, time: hhmm(m) },
                distance: Math.abs(m - center),
            });
        }
    }
    // Screens are usually packed, so also offer replacing a weak, unsold show
    // of another film nearby with this one
    for (const weak of h.shows) {
        if (String(weak.movie) === String(show.movie) || !weak.screen) continue;
        const gap = weak.showDateTime - show.showDateTime;
        if (Math.abs(gap) > window * MINUTE || weak.showDateTime - h.now < ADVISOR.addShowMinHoursAhead * HOUR_MS) continue;
        const wp = h.predictions.get(String(weak._id));
        if (!wp || wp.sold > 0 || wp.occupancy >= ADVISOR.promoThreshold) continue;
        const screen = h.screenById.get(weak.screen);
        if (!screen || !allowedIn(screen.theaterType, roomMovie)) continue;
        if (others.some(t => Math.abs(t - weak.showDateTime) < ADVISOR.sameMovieGapMinutes * MINUTE)) continue;
        if (!h.isFree(screen._id, weak.showDateTime, runtime, String(weak._id))) continue;
        const ticketPrice = priceOf(show, screen.theaterType);
        const tickets = Math.round((screen.capacity || 90) * ADVISOR.spillOverShare);
        const lost = wp.seats * priceOf(weak);
        const m = localMinutes(weak.showDateTime);
        candidates.push({
            id: `replace-${weak._id}`,
            label: `${screen.name} (${screen.theaterType}) · ${formatTime(weak.showDateTime)} · replaces ${weak.movieDoc?.title || 'another film'} (forecast ${Math.round(wp.seats)} seats, none sold)`,
            impact: { revenue: money(tickets * ticketPrice - lost), tickets: Math.round(tickets - wp.seats) },
            params: { screenId: screen._id, date: toCinemaDate(weak.showDateTime), time: hhmm(m), replaceShowId: String(weak._id) },
            distance: Math.abs(m - center),
        });
    }
    if (candidates.length === 0) return null;

    // Best revenue first, then closest to the busy show; at most one option per screen
    candidates.sort((a, b) => b.impact.revenue - a.impact.revenue || a.distance - b.distance);
    const options = [];
    for (const c of candidates) {
        if (c.impact.revenue < ADVISOR.minImpact || options.some(o => o.params.screenId === c.params.screenId)) continue;
        const { distance, ...option } = c;
        options.push(option);
        if (options.length === ADVISOR.maxAddShowOptions) break;
    }
    if (options.length === 0) return null;
    const hours = (show.showDateTime - h.now) / HOUR_MS;
    return {
        type: 'add_showtime',
        priority: priorityFor(options[0].impact.revenue, hours),
        title: `Add another showing of ${movie.title}`,
        reason: `${describe(show, p, h)}. Likely to turn customers away.`,
        options,
    };
};

// Busy Standard show with nothing sold yet: move it to a free premium room
const upgradeRoom = (show, p, h) => {
    if (show.theaterType !== 'Standard' || p.occupancy < ADVISOR.upgradeThreshold) return null;
    const movie = show.movieDoc;
    const runtime = movie.runtime || DEFAULT_RUNTIME;
    const roomMovie = movieForRooms(movie);

    const options = h.screens
        .filter(sc => PREMIUM_UPGRADE_ROOMS.includes(sc.theaterType) && allowedIn(sc.theaterType, roomMovie))
        .filter(sc => h.withinHours(sc.theaterType, show.showDateTime) && h.isFree(sc._id, show.showDateTime, runtime))
        .map(sc => {
            // Tickets already sold keep their price; only new buyers pay the premium
            const f = h.forecast({ ...show, theaterType: sc.theaterType, screen: sc._id }, p.sold);
            const revenue = p.revenueSoFar + (f.seats - p.sold) * priceOf(show, sc.theaterType);
            const current = p.revenueSoFar + (p.seats - p.sold) * priceOf(show);
            return {
                id: `room-${sc._id}`,
                label: `${sc.name} (${sc.theaterType}) · +$${theaterPremiums[sc.theaterType]}/ticket · forecast ${pct(f.occupancy)}`,
                impact: { revenue: money(revenue - current), tickets: Math.round(f.seats - p.seats) },
                params: { screenId: sc._id },
            };
        })
        .filter(o => o.impact.revenue > 0)
        .sort((a, b) => b.impact.revenue - a.impact.revenue);
    if (options.length === 0) return null;

    const hours = (show.showDateTime - h.now) / HOUR_MS;
    return {
        type: 'upgrade_room',
        priority: priorityFor(options[0].impact.revenue, hours),
        title: `Move ${movie.title} to a premium room`,
        reason: `${describe(show, p, h)}. A premium screen is free at the same time.`,
        options,
    };
};

// Weak show with time to go: discount the remaining seats
const promotion = (show, p, h) => {
    const hours = (show.showDateTime - h.now) / HOUR_MS;
    if (p.occupancy >= ADVISOR.promoThreshold || hours < ADVISOR.promoMinHoursAhead || show.promotion?.percent) return null;
    const capacity = show.capacity || 90;
    const price = priceOf(show);
    const remaining = Math.max(0, p.seats - p.sold);

    const options = Object.entries(ADVISOR.priceResponse).map(([percent, response]) => {
        const discounted = money(price * (1 - percent / 100));   // the whole ticket, room premium included
        const newRemaining = Math.min(capacity - p.sold, remaining * (1 + response));
        return {
            id: `promo-${percent}`,
            label: `${percent}% off · $${discounted.toFixed(2)} instead of $${price.toFixed(2)}`,
            impact: { revenue: money(newRemaining * discounted - remaining * price), tickets: Math.round(newRemaining - remaining) },
            params: { percent: Number(percent) },
        };
    });
    const best = Math.max(...options.map(o => o.impact.revenue));
    return {
        type: 'promotion',
        priority: priorityFor(best, hours),
        title: `Run a promotion for ${show.movieDoc.title}`,
        reason: `${describe(show, p, h)}. Seats are likely to go unsold.`,
        options,
    };
};

// Nearly empty show, nothing sold, and the same film plays nearby: cancel it
const cancel = (show, p, h) => {
    const hours = (show.showDateTime - h.now) / HOUR_MS;
    if (p.sold > 0 || p.occupancy >= ADVISOR.cancelThreshold || hours < ADVISOR.cancelMinHoursAhead) return null;
    const nearby = h.sameMovieShows(show.movie)
        .filter(s => String(s._id) !== String(show._id) && Math.abs(s.showDateTime - show.showDateTime) <= ADVISOR.mergeWindowHours * HOUR_MS)
        .sort((a, b) => Math.abs(a.showDateTime - show.showDateTime) - Math.abs(b.showDateTime - show.showDateTime));
    // With a nearby showing some buyers switch to it; without one, all forecast sales are lost
    const alt = nearby[0];
    const transfer = alt ? ADVISOR.cancelTransferShare : 0;
    const lostRevenue = p.seats * priceOf(show) * (1 - transfer);
    const impact = money(ADVISOR.runningCostPerShow - lostRevenue);
    if (impact <= 0) return null;
    return {
        type: 'cancel',
        priority: priorityFor(impact, hours),
        title: `Cancel a near-empty showing of ${show.movieDoc.title}`,
        reason: `${describe(show, p, h)}. ${alt
            ? `Another showing starts at ${formatTime(alt.showDateTime)} (${alt.theaterType}).`
            : `Forecast ticket sales ($${money(p.seats * priceOf(show))}) are below the cost of running it.`}`,
        options: [{
            id: 'cancel',
            label: alt ? `Cancel this showing · customers can choose the ${formatTime(alt.showDateTime)} showing` : 'Cancel this showing',
            impact: { revenue: impact, tickets: -Math.round(p.seats * (1 - transfer)) },
            params: { alternativeShowId: alt ? String(alt._id) : null },
        }],
    };
};
