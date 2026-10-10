import { GoogleGenerativeAI } from "@google/generative-ai";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import { theaterPremiums } from "../configs/theaterTypes.js";
import { toCinemaDate, zonedTimeToUtc } from "../configs/cinemaTime.js";
import mongoose from 'mongoose';
import { startCheckout, releaseSeats, BookingError } from '../services/bookings.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "models/gemini-flash-latest",
    generationConfig: {
        responseMimeType: "application/json",
    }
});

// Everything the model sends is untrusted: coerce to plain values before querying
const str = (v, max = 100) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (v) => mongoose.isValidObjectId(str(v)) ? str(v) : null;

// Only what the chat shows: never seat maps (they hold other customers' ids) or internals
const movieView = (m) => m && ({
    _id: String(m._id), title: m.title, overview: (m.overview || '').slice(0, 300), poster_path: m.poster_path,
    vote_average: m.vote_average, release_date: m.release_date, runtime: m.runtime, genres: (m.genres || []).map(g => g.name),
});
const showView = (s) => ({
    _id: String(s._id), showDateTime: s.showDateTime, theaterType: s.theaterType,
    price: Math.round((s.showPrice + (theaterPremiums[s.theaterType] || 0)) * 100) / 100,
    seatsLeft: Math.max(0, 90 - Object.keys(s.occupiedSeats || {}).length),
});
const bookingView = (b) => ({
    _id: String(b._id), bookedSeat: b.bookedSeat, isPaid: b.isPaid, amount: b.amount,
    show: { showDateTime: b.show?.showDateTime, theaterType: b.show?.theaterType, movie: { title: b.show?.movie?.title || 'Movie' } },
});

/**
 * CineBot Tools implementation. Tools marked `signedIn` get the caller's id
 * from the server, never from the model.
 */
const tools = {
    search_movies: async ({ query }) => {
        const availableMovieIds = await Show.distinct('movie', { showDateTime: { $gte: new Date() } });
        const findQuery = { _id: { $in: availableMovieIds } };
        const q = str(query, 60).trim();
        if (q) findQuery.$or = [{ title: { $regex: escapeRegex(q), $options: 'i' } }, { overview: { $regex: escapeRegex(q), $options: 'i' } }];
        return (await Movie.find(findQuery).limit(3).lean()).map(movieView);
    },

    get_showtimes: async ({ movie_id, date }) => {
        const findQuery = { movie: str(movie_id, 20) };
        const day = str(date, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            const start = zonedTimeToUtc(day, '00:00');
            findQuery.showDateTime = { $gte: new Date(Math.max(start, Date.now())), $lt: new Date(start.getTime() + 86_400_000) };
        } else {
            findQuery.showDateTime = { $gte: new Date() };
        }
        return (await Show.find(findQuery).sort({ showDateTime: 1 }).limit(20).lean()).map(showView);
    },

    get_movie_details: async ({ movie_id }) => movieView(await Movie.findById(str(movie_id, 20)).lean()),

    book_ticket: async ({ user_id, timeslot_id, quantity }, origin) => {
        const count = Number(quantity);
        if (!Number.isInteger(count) || count < 1 || count > 10) return { error: "Please choose between 1 and 10 tickets" };
        const showId = validId(timeslot_id);
        if (!showId) return { error: "Show not found" };
        const show = await Show.findById(showId).populate('movie', 'title').select('occupiedSeats showDateTime movie').lean();
        if (!show) return { error: "Show not found" };

        // Pick the first free seats, front rows first, using the real seat map
        const taken = show.occupiedSeats || {};
        const seats = [];
        for (const row of 'ABCDEFGHIJ') {
            for (let i = 1; i <= 9 && seats.length < count; i++) if (!taken[`${row}${i}`]) seats.push(`${row}${i}`);
            if (seats.length === count) break;
        }
        if (seats.length < count) return { error: "Not enough seats available" };

        try {
            const { booking, url } = await startCheckout({ userId: user_id, showId, seats, origin });
            return {
                booking_id: String(booking._id),
                movie: show.movie?.title || 'Movie',
                date: toCinemaDate(show.showDateTime),
                time: show.showDateTime.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' }),
                seats: seats.join(', '),
                total: booking.amount,
                payment_url: url,
            };
        } catch (error) {
            return { error: error instanceof BookingError ? error.message : 'Booking failed, please try again' };
        }
    },

    get_booking: async ({ user_id, booking_ref }) => {
        const query = { user: user_id };
        const ref = validId(booking_ref);
        if (booking_ref && !ref) return [];
        if (ref) query._id = ref;
        const bookings = await Booking.find(query).populate({ path: 'show', populate: { path: 'movie', select: 'title' } })
            .sort({ createdAt: -1 }).limit(10).lean();
        return bookings.map(bookingView);
    },

    cancel_booking: async ({ user_id, booking_ref }) => {
        const ref = validId(booking_ref);
        if (!ref) return { error: "Booking not found or unauthorized" };
        const booking = await Booking.findOneAndDelete({ _id: ref, user: user_id }).lean();
        if (!booking) return { error: "Booking not found or unauthorized" };
        await releaseSeats(booking.show, booking.bookedSeat);
        return { success: true };
    },

    get_recommendations: async () => {
        // Only recommend movies that have upcoming shows
        const availableMovieIds = await Show.distinct('movie', { showDateTime: { $gte: new Date() } });
        return (await Movie.find({ _id: { $in: availableMovieIds } }).sort({ vote_average: -1 }).limit(3).lean()).map(movieView);
    },
};

const SIGNED_IN_TOOLS = new Set(['book_ticket', 'get_booking', 'cancel_booking']);

const SYSTEM_PROMPT = `
You are CineBot, an intelligent AI movie assistant for DB-Cinema.
You help users discover movies, book tickets, and manage reservations through natural conversation.

PERSONALITY:
- Friendly, enthusiastic about movies 🎬
- Concise but helpful — no long walls of text
- Use emojis naturally
- ALWAYS confirm actions before executing them

CAPABILITIES:
You can call tools to perform actions. When a tool is needed, respond with a JSON object describing the tool call.

TOOLS:
- search_movies({ query, filters })
- get_showtimes({ movie_id, date })
- get_movie_details({ movie_id })
- book_ticket({ user_id, movie_id, timeslot_id, quantity, seat_preference })
- get_booking({ user_id, booking_ref })
- cancel_booking({ user_id, booking_ref })
- get_recommendations({ user_id })

RESPONSE FORMAT (MUST BE VALID JSON):
{
    "message": "The natural language response to the user",
    "tool_call": {
        "name": "tool_name",
        "parameters": { ... }
    } | null,
    "ui_hint": "movie_list" | "showtimes" | "booking_summary" | "booking_list" | null
}

IMPORTANT:
- If a user wants to book, first get_showtimes to show options.
- Once they pick a time and quantity, summarize and ask: "Just to confirm: [X] tickets for [Movie] at [Time] on [Date] — total $[Amount]. Shall I confirm? ✅"
- Only call book_ticket AFTER they say YES or confirm.
- For cancellations, list bookings first, then confirm before calling cancel_booking.
`;

const MAX_MESSAGE = 1000;
const MAX_HISTORY = 10;

export const chatHandler = async (req, res) => {
    try {
        const { message, context, history } = req.body;
        const userId = req.auth?.()?.userId || null;
        const origin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
        const text = str(message, MAX_MESSAGE).trim();
        if (!text) return res.json({ success: false, message: "Please type a message." });
        // Keep only recent, short history entries, and only the page path from the context
        const recent = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY)
            .map(h => ({ user: str(h?.user, MAX_MESSAGE), bot: str(h?.bot, MAX_MESSAGE) }));
        const page = str(context?.current_path, 200);

        const prompt = `
        User ID: ${userId}
        History: ${JSON.stringify(recent)}
        Context: ${JSON.stringify({ current_path: page })}
        User Message: ${JSON.stringify(text)}

        Analyze the message and return the required JSON response.
        `;

        const result = await model.generateContent([SYSTEM_PROMPT, prompt]);
        const cleanJson = result.response.text().replace(/```json|```/g, "").trim();
        const chatResponse = JSON.parse(cleanJson);

        // Execute a tool only if it is one of ours
        if (chatResponse.tool_call) {
            const toolName = str(chatResponse.tool_call.name, 40);
            const params = typeof chatResponse.tool_call.parameters === 'object' && chatResponse.tool_call.parameters ? { ...chatResponse.tool_call.parameters } : {};
            if (!Object.hasOwn(tools, toolName)) {
                chatResponse.tool_error = 'That action is not available.';
            } else if (SIGNED_IN_TOOLS.has(toolName) && !userId) {
                chatResponse.tool_error = 'Please sign in to book or manage tickets.';
            } else {
                if (SIGNED_IN_TOOLS.has(toolName)) params.user_id = userId;   // never trust an id from the model
                try {
                    chatResponse.tool_result = await tools[toolName](params, origin);
                } catch (toolErr) {
                    console.error(`[CineBot] Tool ${toolName} failed:`, toolErr.message);
                    chatResponse.tool_error = 'Sorry, something went wrong with that request.';
                }
            }
        }

        res.json({ success: true, ...chatResponse });

    } catch (error) {
        console.error("[CineBot] Controller Error:", error.message);
        res.json({ success: false, message: "Oops! My circuits got a bit tangled 🤖 Try again in a moment." });
    }
};

