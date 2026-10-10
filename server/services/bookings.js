/**
 * Seat holds, checkout and payment confirmation, shared by the booking pages,
 * the chatbot, Stripe's webhook and the admin tools.
 *
 * Seats are claimed atomically on the Show (one update that only succeeds if
 * every seat is still free), so two customers can never get the same seat and
 * concurrent bookings never overwrite each other. Unpaid holds expire after
 * HOLD_MINUTES; the Stripe session expires a few minutes earlier, so nobody
 * can pay for seats that have already been released.
 */
import Stripe from 'stripe';
import { clerkClient } from '@clerk/express';
import Show from '../models/Show.js';
import Booking from '../models/Booking.js';
import '../models/Movie.js';   // registers the model used by populate('movie')
import { inngest } from '../inngest/index.js';
import { theaterPremiums, SEATS_PER_SHOW } from '../configs/theaterTypes.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const MINUTE = 60_000;
const CHECKOUT_MINUTES = 30;              // Stripe's minimum session lifetime
const HOLD_MINUTES = CHECKOUT_MINUTES + 5; // seats outlive the payment window
const MAX_SEATS = 10;
const ROWS = 'ABCDEFGHIJ';
const SEATS_PER_ROW = SEATS_PER_SHOW / ROWS.length;
const SEAT_RE = new RegExp(`^[${ROWS}]([1-9]|[1-9][0-9])$`);

// A problem the customer can fix or should be told about
export class BookingError extends Error {}

const money = (n) => Math.round(n * 100) / 100;
export const ticketPrice = (show) => money(show.showPrice + (theaterPremiums[show.theaterType] ?? 0));

const validSeat = (seat) => SEAT_RE.test(seat) && Number(seat.slice(1)) <= SEATS_PER_ROW;

export const normalizeSeats = (seats) => {
    if (!Array.isArray(seats) || seats.length === 0) throw new BookingError('Choose at least one seat');
    const list = [...new Set(seats.map(s => String(s).trim().toUpperCase()))];
    if (list.length > MAX_SEATS) throw new BookingError(`You can book up to ${MAX_SEATS} seats at a time`);
    if (!list.every(validSeat)) throw new BookingError('One of the selected seats does not exist');
    return list;
};

const seatPath = (seat) => `occupiedSeats.${seat}`;

/** Claim seats on an upcoming show for `userId`; false if any is taken (or the show is gone/started). */
export const claimSeats = async (showId, seats, userId) => {
    const { modifiedCount } = await Show.updateOne(
        { _id: showId, showDateTime: { $gt: new Date() }, ...Object.fromEntries(seats.map(s => [seatPath(s), { $exists: false }])) },
        { $set: Object.fromEntries(seats.map(s => [seatPath(s), userId])) },
    );
    return modifiedCount === 1;
};

/** Free seats on a show (only call after the booking that held them is gone). */
export const releaseSeats = async (showId, seats) => {
    if (!seats?.length) return;
    await Show.updateOne({ _id: showId }, { $unset: Object.fromEntries(seats.map(s => [seatPath(s), ''])) });
};

/** Delete an unpaid booking and free its seats; false if it was paid or already gone. */
export const dropUnpaidBooking = async (filter) => {
    const booking = await Booking.findOneAndDelete({ ...filter, isPaid: false }).lean();
    if (!booking) return false;
    await releaseSeats(booking.show, booking.bookedSeat);
    return true;
};

const checkoutSession = async ({ booking, show, origin }) => stripe.checkout.sessions.create({
    success_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
    // One line for the whole booking, charged at the amount stored on it
    line_items: [{
        price_data: {
            currency: 'usd',
            product_data: { name: `${show.movie?.title || 'Movie'} (${show.theaterType}) · ${booking.bookedSeat.length} seat${booking.bookedSeat.length === 1 ? '' : 's'}: ${booking.bookedSeat.join(', ')}` },
            unit_amount: Math.round(booking.amount * 100),
        },
        quantity: 1,
    }],
    mode: 'payment',
    expires_at: Math.floor((Date.now() + CHECKOUT_MINUTES * MINUTE) / 1000),
    metadata: { bookingId: String(booking._id) },
});

/**
 * Hold seats and open a Stripe checkout.
 * @returns {{ booking, url }}
 */
export const startCheckout = async ({ userId, showId, seats, origin }) => {
    const list = normalizeSeats(seats);
    const show = await Show.findById(showId).populate('movie', 'title').select('-occupiedSeats').lean();
    if (!show) throw new BookingError('Show not found');
    if (show.showDateTime <= new Date()) throw new BookingError('This show has already started');

    await releaseExpiredHolds({ showId: String(show._id) });
    if (!(await claimSeats(show._id, list, userId))) throw new BookingError('Some of those seats were just taken. Please pick again.');

    let booking;
    try {
        booking = await Booking.create({
            user: userId,
            show: String(show._id),
            bookedSeat: list,
            amount: money(ticketPrice(show) * list.length),
            holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * MINUTE),
        });
        const session = await checkoutSession({ booking, show, origin });
        await Booking.updateOne({ _id: booking._id }, { $set: { stripeSessionId: session.id } });
        return { booking, url: session.url };
    } catch (error) {
        // Don't leave seats held for a checkout that never opened
        if (booking) await dropUnpaidBooking({ _id: booking._id });
        else await releaseSeats(show._id, list);
        throw error;
    }
};

/** New checkout for an unpaid booking whose seats are still held, at the booked amount. */
export const resumeCheckout = async ({ userId, bookingId, origin }) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId }).lean();
    if (!booking) throw new BookingError('Booking not found');
    if (booking.isPaid) throw new BookingError('This booking is already paid');
    const show = await Show.findById(booking.show).populate('movie', 'title').lean();
    const stillHeld = show && show.showDateTime > new Date() && booking.bookedSeat.every(s => show.occupiedSeats?.[s] === userId);
    if (!stillHeld) {
        await dropUnpaidBooking({ _id: booking._id });
        throw new BookingError('Your seat hold has expired. Please book again.');
    }
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * MINUTE);
    const { modifiedCount } = await Booking.updateOne({ _id: booking._id, isPaid: false }, { $set: { holdExpiresAt } });
    if (!modifiedCount) throw new BookingError('This booking is already paid');
    const session = await checkoutSession({ booking, show, origin });
    await Booking.updateOne({ _id: booking._id }, { $set: { stripeSessionId: session.id } });
    return { url: session.url };
};

const sendConfirmation = async (booking) => {
    try {
        const full = await Booking.findById(booking._id).populate({ path: 'show', populate: { path: 'movie' } }).lean();
        const user = await clerkClient.users.getUser(full.user);
        await inngest.send({
            name: 'booking/payment.confirmed',
            data: {
                userId: full.user,
                bookingId: full._id,
                movieTitle: full.show?.movie?.title,
                seats: full.bookedSeat,
                showDateTime: full.show?.showDateTime,
                theaterType: full.show?.theaterType,
                amount: full.amount,
                userName: user.firstName || 'User',
            },
        });
    } catch (error) {
        console.error('[Booking] Confirmation email not sent:', error.message);
    }
};

/**
 * Mark a booking paid from a Stripe Checkout session. Idempotent: the webhook
 * and the result page may both call it; the email goes out only once.
 * @returns {'paid' | 'already-paid' | 'not-paid' | 'missing'}
 */
export const confirmPayment = async (session) => {
    if (session.payment_status !== 'paid') return 'not-paid';
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) return 'missing';

    const booking = await Booking.findOneAndUpdate(
        { _id: bookingId, isPaid: false },
        { $set: { isPaid: true, paymentLink: session.id, holdExpiresAt: null } },
        { new: true },
    ).lean();
    if (booking) {
        if (session.amount_total != null && session.amount_total !== Math.round(booking.amount * 100)) {
            console.warn(`[Booking] ${bookingId} paid ${session.amount_total} cents but booking amount is ${booking.amount}`);
        }
        await sendConfirmation(booking);
        return 'paid';
    }
    if (await Booking.exists({ _id: bookingId, isPaid: true })) return 'already-paid';
    console.error(`[Booking] Stripe session ${session.id} was paid but booking ${bookingId} no longer exists`);
    return 'missing';
};

/**
 * Release unpaid holds that have expired (optionally for one show). Before
 * releasing, ask Stripe whether the customer paid after all (e.g. a delayed
 * webhook), so a paid booking is never thrown away.
 */
export const releaseExpiredHolds = async ({ showId, limit = 200 } = {}) => {
    const now = new Date();
    const filter = {
        isPaid: false,
        isSimulated: { $ne: true },
        $or: [
            { holdExpiresAt: { $lt: now } },
            { holdExpiresAt: null, createdAt: { $lt: new Date(now - HOLD_MINUTES * MINUTE) } },   // older bookings
        ],
    };
    if (showId) filter.show = showId;
    const expired = await Booking.find(filter).limit(limit).lean();
    let released = 0;
    for (const booking of expired) {
        if (booking.stripeSessionId) {
            try {
                const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
                if (session.payment_status === 'paid') { await confirmPayment(session); continue; }
                if (session.status === 'open') await stripe.checkout.sessions.expire(session.id).catch(() => {});
            } catch (error) {
                console.error(`[Booking] Could not check Stripe for ${booking._id}:`, error.message);
                continue;   // try again next time rather than risk dropping a paid booking
            }
        }
        if (await dropUnpaidBooking({ _id: booking._id, holdExpiresAt: booking.holdExpiresAt })) released += 1;
    }
    return { released };
};
