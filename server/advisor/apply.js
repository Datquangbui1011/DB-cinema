/**
 * Apply one option of an AI Advisor recommendation.
 *
 *   1. Claim the recommendation (so two admins can't apply it twice).
 *   2. Re-validate against fresh data: the show still exists and is upcoming,
 *      the screen is still free, no tickets were sold where that matters.
 *      If not, the recommendation expires with a clear message.
 *   3. Change the Show using the same rules as the Shows page.
 *   4. Record what changed and how to undo it.
 *   5. Re-run the advisor so forecasts and advice reflect the change.
 *
 * Changes are live for customers immediately: booking pages read the same Show data.
 */
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Booking from '../models/Booking.js';
import Screen from '../models/Screen.js';
import Recommendation from '../models/Recommendation.js';
import { zonedTimeToUtc, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { theaterPremiums } from '../configs/theaterTypes.js';
import { hoursFor } from '../configs/screens.js';
import { allowedIn, isFamilyFriendly } from '../scheduler/screenPlanner.js';
import { findScreenConflicts, conflictMessage } from '../services/showConflicts.js';
import { PREMIUM_UPGRADE_ROOMS } from './advisorConfig.js';
import { runAdvisor } from './runAdvisor.js';

const DEFAULT_RUNTIME = 120;
const CLAIM_TIMEOUT_MS = 2 * 60_000;      // a crashed apply releases its claim after this

// A reason the option can no longer be applied; the recommendation expires
class StaleError extends Error {}
const stale = (message) => { throw new StaleError(message); };

export const hasSales = async (show) =>
    Object.keys(show.occupiedSeats || {}).length > 0 ||
    Boolean(await Booking.exists({ show: String(show._id), isPaid: true }));

const money = (n) => Math.round(n * 100) / 100;
const localMinutes = (date) => {
    const [h, m] = date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
    return (h % 24) * 60 + m;
};
const snapshot = (show) => {
    const { _id, __v, ...rest } = show;
    return { ...rest, _id: String(_id) };
};

const loadUpcomingShow = async (showId) => {
    const show = await Show.findById(showId).lean();
    if (!show) stale('This show no longer exists.');
    if (show.showDateTime <= new Date()) stale('This show has already started.');
    return show;
};

// Screen exists, may play this film, is open then and is free (ignoring `excludeShowId`)
const checkScreen = async (screenId, movie, start, { excludeShowId } = {}) => {
    const screen = await Screen.findById(screenId).lean();
    if (!screen || !screen.active) stale('That screen is no longer available.');
    if (!allowedIn(screen.theaterType, { family: isFamilyFriendly((movie.genres || []).map(g => g.id)) })) {
        stale(`${screen.name} (${screen.theaterType}) can't play this film.`);
    }
    const minutes = localMinutes(start), hours = hoursFor(screen.theaterType);
    if (minutes < hours.open || minutes > hours.lastStart) stale(`${screen.name} isn't open at that time.`);
    const conflicts = await findScreenConflicts(screen._id, [start], movie.runtime || DEFAULT_RUNTIME, { excludeShowId });
    if (conflicts.length) stale(conflictMessage(screen.name, conflicts));
    return screen;
};

// Remove a show nobody has paid for, with its abandoned checkouts (as Cancel Show does)
const removeUnsoldShow = async (show) => {
    if (await hasSales(show)) stale('Tickets have been sold for that show since this was recommended.');
    await Booking.deleteMany({ show: String(show._id), isPaid: false });
    const { deletedCount } = await Show.deleteOne({ _id: show._id, occupiedSeats: {} });
    if (!deletedCount) stale('Tickets have been sold for that show since this was recommended.');
};

const APPLY = {
    // New showing on a free screen, or in place of an unsold weak show
    async add_showtime(rec, option) {
        const busy = await loadUpcomingShow(rec.show);
        const movie = await Movie.findById(busy.movie).lean();
        if (!movie) stale('The movie no longer exists.');
        const { screenId, date, time, replaceShowId } = option.params;
        const start = zonedTimeToUtc(date, time);
        if (start <= new Date()) stale('That time has already passed.');

        let replaced = null;
        if (replaceShowId) {
            replaced = await loadUpcomingShow(replaceShowId);
            if (replaced.screen !== screenId) stale('The show to replace has moved to another screen.');
            if (await hasSales(replaced)) stale('Tickets have been sold for the show it would replace.');
        }
        const screen = await checkScreen(screenId, movie, start, { excludeShowId: replaced?._id });

        if (replaced) await removeUnsoldShow(replaced);
        let created;
        try {
            created = await Show.create({
                movie: String(busy.movie),
                showDateTime: start,
                showPrice: busy.promotion?.originalPrice ?? busy.showPrice,
                theaterType: screen.theaterType,
                screen: screen._id,
                occupiedSeats: {},
            });
        } catch (error) {
            if (replaced) await Show.create({ ...replaced, _id: replaced._id });   // put it back
            throw error;
        }

        return {
            summary: `Added ${movie.title} on ${screen.name} at ${start.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, weekday: 'short', hour: 'numeric', minute: '2-digit' })}${replaced ? ' (replacing an unsold show)' : ''}`,
            affectedShowIds: [String(busy._id), String(created._id)],
            result: { before: { replacedShow: replaced ? snapshot(replaced) : null }, after: { showId: String(created._id) }, createdShowIds: [String(created._id)] },
            undo: { action: 'remove_added_show', showId: String(created._id), restoreShow: replaced ? snapshot(replaced) : null },
        };
    },

    // Same time, premium screen; existing tickets stay valid at their price
    async upgrade_room(rec, option) {
        const show = await loadUpcomingShow(rec.show);
        if (show.theaterType !== 'Standard') stale('This show is no longer in a Standard room.');
        const movie = await Movie.findById(show.movie).lean();
        const screen = await checkScreen(option.params.screenId, movie, show.showDateTime, { excludeShowId: show._id });
        if (!PREMIUM_UPGRADE_ROOMS.includes(screen.theaterType)) stale(`${screen.name} isn't a premium room.`);

        await Show.updateOne({ _id: show._id }, { $set: { screen: screen._id, theaterType: screen.theaterType } });
        return {
            summary: `Moved ${movie.title} to ${screen.name} (${screen.theaterType})`,
            affectedShowIds: [String(show._id)],
            result: { before: { screen: show.screen, theaterType: show.theaterType }, after: { screen: screen._id, theaterType: screen.theaterType } },
            undo: { action: 'move_back', showId: String(show._id), screen: show.screen, theaterType: show.theaterType, upgradedTo: screen._id },
        };
    },

    // Discount the whole ticket until the show starts
    async promotion(rec, option) {
        const show = await loadUpcomingShow(rec.show);
        if (show.promotion?.percent) stale('This show already has a promotion.');
        const percent = Number(option.params.percent);
        if (![10, 20, 30].includes(percent)) stale('Unknown discount.');
        const premium = theaterPremiums[show.theaterType] ?? 0;
        const ticket = show.showPrice + premium;
        const discounted = money(ticket * (1 - percent / 100));
        const showPrice = money(discounted - premium);
        if (showPrice <= 0) stale('The discounted price would be too low.');

        const promotion = { percent, originalPrice: show.showPrice, endsAt: show.showDateTime, recommendationId: String(rec._id) };
        const { modifiedCount } = await Show.updateOne({ _id: show._id, showPrice: show.showPrice }, { $set: { showPrice, promotion } });
        if (!modifiedCount) stale("The show's price changed since this was recommended.");
        return {
            summary: `${percent}% off: tickets now $${discounted.toFixed(2)} instead of $${ticket.toFixed(2)}`,
            affectedShowIds: [String(show._id)],
            result: { before: { showPrice: show.showPrice, ticketPrice: ticket }, after: { showPrice, ticketPrice: discounted, percent } },
            undo: { action: 'end_promotion', showId: String(show._id), originalPrice: show.showPrice },
        };
    },

    // Remove an unsold showing
    async cancel(rec) {
        const show = await loadUpcomingShow(rec.show);
        await removeUnsoldShow(show);
        return {
            summary: 'Showing cancelled',
            affectedShowIds: [],
            result: { before: { show: snapshot(show) }, after: { cancelled: true } },
            undo: { action: 'restore_show', show: snapshot(show) },
        };
    },
};

/**
 * @param {object} [opts]
 * @param {boolean} [opts.refresh=true]  re-run the advisor afterwards (autopilot does it once at the end)
 * @returns {{ success: boolean, message: string, expired?: boolean }}
 */
export const applyRecommendation = async (recommendationId, optionId, userId, { refresh = true } = {}) => {
    const now = new Date();
    const rec = await Recommendation.findOneAndUpdate(
        { _id: recommendationId, status: 'pending', $or: [{ applyingAt: null }, { applyingAt: { $lt: new Date(now - CLAIM_TIMEOUT_MS) } }] },
        { $set: { applyingAt: now } },
        { new: true },
    ).lean();
    if (!rec) return { success: false, message: 'This recommendation is no longer pending (it may have just been applied or dismissed).' };

    const option = rec.options.find(o => o.id === optionId);
    if (!option) {
        await Recommendation.updateOne({ _id: rec._id }, { $set: { applyingAt: null } });
        return { success: false, message: 'That option is not part of this recommendation.' };
    }

    let outcome;
    try {
        outcome = await APPLY[rec.type](rec, option);
    } catch (error) {
        if (!(error instanceof StaleError)) {
            await Recommendation.updateOne({ _id: rec._id }, { $set: { applyingAt: null } });
            throw error;
        }
        await Recommendation.updateOne({ _id: rec._id }, { $set: { status: 'expired', closedAt: new Date(), applyingAt: null } });
        if (refresh) await runAdvisor({ trigger: 'apply' });
        return { success: false, expired: true, message: `Couldn't apply: ${error.message.replace(/\.?$/, '.')} The advice has been refreshed.` };
    }

    await Recommendation.updateOne({ _id: rec._id }, {
        $set: {
            status: 'applied', chosenOption: option.id, appliedBy: userId, appliedAt: new Date(), applyingAt: null,
            result: { ...outcome.result, summary: outcome.summary }, undo: outcome.undo,
        },
    });
    if (!refresh) return { success: true, message: outcome.summary };
    // Re-forecast every upcoming show and refresh the advice
    const report = await runAdvisor({ trigger: 'apply' });
    return { success: true, message: `${outcome.summary}. Forecast and advice updated.`, report };
};
