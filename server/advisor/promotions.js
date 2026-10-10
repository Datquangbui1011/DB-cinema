import Show from '../models/Show.js';
import Recommendation from '../models/Recommendation.js';
import { theaterPremiums } from '../configs/theaterTypes.js';

// Promotion details customers see, or null when there is none (or it has ended)
export const activePromotion = (show, now = new Date()) => {
    const p = show.promotion;
    if (!p?.percent || (p.endsAt && new Date(p.endsAt) <= now)) return null;
    const premium = theaterPremiums[show.theaterType] ?? 0;
    return { percent: p.percent, originalPrice: p.originalPrice, originalTicketPrice: p.originalPrice + premium };
};

/**
 * Restore a show's original price and remove its promotion. The advisor
 * recommendation that started it (if any) is marked undone.
 * @returns {{ success: boolean, message: string }}
 */
export const endPromotion = async (showId, { by = null } = {}) => {
    const show = await Show.findById(showId).lean();
    if (!show) return { success: false, message: 'Show not found' };
    if (!show.promotion?.percent) return { success: false, message: 'This show has no promotion' };

    const { modifiedCount } = await Show.updateOne(
        { _id: show._id, 'promotion.percent': show.promotion.percent },
        { $set: { showPrice: show.promotion.originalPrice, promotion: null } },
    );
    if (!modifiedCount) return { success: false, message: 'The promotion has already ended' };

    if (show.promotion.recommendationId) {
        await Recommendation.updateOne(
            { _id: show.promotion.recommendationId, status: 'applied' },
            { $set: { status: 'undone', closedAt: new Date(), closedBy: by } },
        );
    }
    const ticket = show.promotion.originalPrice + (theaterPremiums[show.theaterType] ?? 0);
    return { success: true, message: `Promotion ended: tickets are back to $${ticket.toFixed(2)}` };
};
