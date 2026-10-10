import Stripe from 'stripe';
import mongoose from 'mongoose';
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import {
    BookingError, startCheckout, resumeCheckout, confirmPayment, releaseExpiredHolds, releaseSeats, dropUnpaidBooking,
} from "../services/bookings.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Customer-facing message: our own BookingErrors as written, anything else generic
const failure = (res, error, context) => {
    if (error instanceof BookingError) return res.json({ success: false, message: error.message });
    console.error(`[Booking] ${context}:`, error);
    return res.json({ success: false, message: 'Something went wrong. Please try again.' });
};

const signedInUser = (req, res) => {
    const { userId } = req.auth();
    if (!userId) res.json({ success: false, message: "Authentication required. Please log in." });
    return userId;
};

// POST /api/booking/create — body { showId, selectedSeats }
export const createBooking = async (req, res) => {
    try {
        const userId = signedInUser(req, res);
        if (!userId) return;
        const { showId, selectedSeats } = req.body;
        if (!mongoose.isValidObjectId(showId)) return res.json({ success: false, message: 'Show not found' });
        const { url } = await startCheckout({ userId, showId, seats: selectedSeats, origin: req.headers.origin });
        res.json({ success: true, message: "Booking created successfully", url });
    } catch (error) {
        failure(res, error, 'Create failed');
    }
};

// GET /api/booking/seats/:showId
export const getOccupiedSeats = async (req, res) => {
    try {
        const { showId } = req.params;
        if (!mongoose.isValidObjectId(showId)) return res.json({ success: false, message: "Show not found" });
        await releaseExpiredHolds({ showId, limit: 20 });
        const showData = await Show.findById(showId).select('occupiedSeats').lean();
        if (!showData) return res.json({ success: false, message: "Show not found" });
        return res.json({ success: true, occupiedSeats: Object.keys(showData.occupiedSeats || {}) });
    } catch (error) {
        failure(res, error, 'Seats failed');
    }
};

// POST /api/booking/cancel — body { bookingId }; the customer's own booking
export const cancelBooking = async (req, res) => {
    try {
        const userId = signedInUser(req, res);
        if (!userId) return;
        const { bookingId } = req.body;
        if (!mongoose.isValidObjectId(bookingId)) return res.json({ success: false, message: "Booking not found" });
        const booking = await Booking.findOneAndDelete({ _id: bookingId, user: userId }).lean();
        if (!booking) return res.json({ success: false, message: "Booking not found" });
        await releaseSeats(booking.show, booking.bookedSeat);
        res.json({ success: true, message: "Booking cancelled successfully" });
    } catch (error) {
        failure(res, error, 'Cancel failed');
    }
};

// POST /api/booking/verify — body { sessionId }; called by the result page after Stripe
export const verifyStripe = async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) return res.json({ success: false, message: "Payment not found" });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const outcome = await confirmPayment(session);
        if (outcome === 'paid' || outcome === 'already-paid') return res.json({ success: true, message: "Payment successful" });
        if (outcome === 'missing') {
            return res.json({ success: false, message: "We received your payment but couldn't find your booking. Please contact us with your receipt and we'll sort it out." });
        }
        res.json({ success: false, message: "Payment was not completed" });
    } catch (error) {
        failure(res, error, 'Verify failed');
    }
};

// POST /api/booking/payment — body { bookingId }; pay for an unpaid booking again
export const createPaymentSession = async (req, res) => {
    try {
        const userId = signedInUser(req, res);
        if (!userId) return;
        const { bookingId } = req.body;
        if (!mongoose.isValidObjectId(bookingId)) return res.json({ success: false, message: "Booking not found" });
        const { url } = await resumeCheckout({ userId, bookingId, origin: req.headers.origin });
        res.json({ success: true, url });
    } catch (error) {
        failure(res, error, 'Payment session failed');
    }
};

/**
 * POST /api/stripe/webhook — Stripe calls this when a checkout completes or
 * expires, even if the customer closed the tab. Needs the raw request body and
 * STRIPE_WEBHOOK_SECRET (from the webhook's page in the Stripe dashboard).
 */
export const stripeWebhook = async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        console.error('[Stripe] STRIPE_WEBHOOK_SECRET is not set; ignoring webhook');
        return res.status(503).send('Webhook not configured');
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (error) {
        console.error('[Stripe] Bad webhook signature:', error.message);
        return res.status(400).send('Invalid signature');
    }
    try {
        const session = event.data.object;
        if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
            await confirmPayment(session);
        } else if (event.type === 'checkout.session.expired' && session.metadata?.bookingId) {
            // Free the seats now, unless a retry has since opened a newer checkout for this booking
            await dropUnpaidBooking({ _id: session.metadata.bookingId, stripeSessionId: session.id });
        }
        res.json({ received: true });
    } catch (error) {
        console.error('[Stripe] Webhook handling failed:', error);
        res.status(500).send('Webhook handling failed');   // Stripe retries
    }
};
