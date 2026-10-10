/**
 * Reverse an applied AI Advisor recommendation, when that is still safe:
 *
 *   added showtime  -> remove the new show (no tickets sold for it) and put
 *                      back the show it replaced, if its slot is still free
 *   upgraded room   -> move it back (no tickets sold since, old screen free)
 *   promotion       -> restore the original price (tickets sold keep their price)
 *   cancellation    -> re-create the show in the same slot (still free, still upcoming)
 */
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Booking from '../models/Booking.js';
import Recommendation from '../models/Recommendation.js';
import { findScreenConflicts, conflictMessage } from '../services/showConflicts.js';
import Screen from '../models/Screen.js';
import { hasSales } from './apply.js';
import { endPromotion } from './promotions.js';
import { runAdvisor } from './runAdvisor.js';

const DEFAULT_RUNTIME = 120;

class CannotUndo extends Error {}
const refuse = (message) => { throw new CannotUndo(message); };

// Put a deleted show back with its original id, if its slot is still free and upcoming
const restoreShow = async (saved) => {
    const start = new Date(saved.showDateTime);
    if (start <= new Date()) refuse('That showtime has already passed.');
    if (await Show.exists({ _id: saved._id })) return false;
    const movie = await Movie.findById(saved.movie).select('runtime').lean();
    if (saved.screen) {
        const conflicts = await findScreenConflicts(saved.screen, [start], movie?.runtime || DEFAULT_RUNTIME);
        if (conflicts.length) {
            const screen = await Screen.findById(saved.screen).select('name').lean();
            refuse(conflictMessage(screen?.name || 'The screen', conflicts));
        }
    }
    // Back at its regular price: a promotion running when it was removed is not restored
    await Show.create({ ...saved, showPrice: saved.promotion?.originalPrice ?? saved.showPrice, showDateTime: start, occupiedSeats: {}, promotion: null });
    return true;
};

const UNDO = {
    async remove_added_show(rec, undo) {
        const added = await Show.findById(undo.showId).lean();
        if (added) {
            if (await hasSales(added)) refuse('Tickets have been sold for the added showing, so it can no longer be removed here.');
            const { deletedCount } = await Show.deleteOne({ _id: added._id, occupiedSeats: {} });
            if (!deletedCount) refuse('Someone is booking the added showing right now, so it was left in place.');
            await Booking.deleteMany({ show: String(added._id), isPaid: false });
        }
        if (undo.restoreShow) {
            try {
                await restoreShow(undo.restoreShow);
            } catch (error) {
                if (!(error instanceof CannotUndo)) throw error;
                return `Removed the added showing; the show it replaced could not be restored (${error.message.replace(/\.$/, '')})`;
            }
            return 'Removed the added showing and restored the show it replaced';
        }
        return 'Removed the added showing';
    },

    async move_back(rec, undo) {
        const show = await Show.findById(undo.showId).populate('movie', 'runtime').lean();
        if (!show) refuse('The show no longer exists.');
        if (show.showDateTime <= new Date()) refuse('The show has already started.');
        if (show.screen !== undo.upgradedTo) refuse('The show has been moved again since, so it was left where it is.');
        // Paid or still checking out: those customers chose (and pay for) the premium room
        if (await Booking.exists({ show: String(show._id), createdAt: { $gt: rec.appliedAt } })) {
            refuse('Customers have booked the premium room since, so it stays there.');
        }
        const conflicts = await findScreenConflicts(undo.screen, [show.showDateTime], show.movie?.runtime || DEFAULT_RUNTIME, { excludeShowId: show._id });
        if (conflicts.length) refuse(conflictMessage('The original screen', conflicts));
        await Show.updateOne({ _id: show._id }, { $set: { screen: undo.screen, theaterType: undo.theaterType } });
        return 'Moved the show back to its original room';
    },

    async end_promotion(rec, undo, userId) {
        const outcome = await endPromotion(undo.showId, { by: userId });
        if (!outcome.success && outcome.message !== 'This show has no promotion') refuse(outcome.message);
        return outcome.success ? outcome.message : 'The promotion had already ended';
    },

    async restore_show(rec, undo) {
        const restored = await restoreShow(undo.show);
        return restored ? 'Restored the cancelled showing' : 'The showing already exists';
    },
};

/**
 * @returns {{ success: boolean, message: string }}
 */
export const undoRecommendation = async (recommendationId, userId) => {
    const rec = await Recommendation.findOne({ _id: recommendationId, status: 'applied' }).lean();
    if (!rec) return { success: false, message: 'Only applied recommendations can be undone.' };
    if (!rec.undo?.action || !UNDO[rec.undo.action]) return { success: false, message: 'This change cannot be undone automatically.' };

    // Claim it (as apply does) so two clicks can't both run the undo
    const now = new Date();
    const claimed = await Recommendation.updateOne(
        { _id: rec._id, status: 'applied', $or: [{ applyingAt: null }, { applyingAt: { $lt: new Date(now - 2 * 60_000) } }] },
        { $set: { applyingAt: now } },
    );
    if (!claimed.modifiedCount) return { success: false, message: 'This change is already being undone.' };

    let message;
    try {
        message = await UNDO[rec.undo.action](rec, rec.undo, userId);
    } catch (error) {
        await Recommendation.updateOne({ _id: rec._id }, { $set: { applyingAt: null } });
        if (error instanceof CannotUndo) return { success: false, message: `Couldn't undo: ${error.message}` };
        throw error;
    }
    await Recommendation.updateOne(
        { _id: rec._id },
        { $set: { status: 'undone', closedAt: new Date(), closedBy: userId, applyingAt: null, 'result.undoneMessage': message } },
    );
    await runAdvisor({ trigger: 'undo' });
    return { success: true, message: `${message}. Forecast and advice updated.` };
};
