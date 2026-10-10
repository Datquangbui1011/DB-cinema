import { GoogleGenerativeAI } from "@google/generative-ai";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import { clerkClient } from "@clerk/express";
import Stripe from 'stripe';
import { theaterPremiums } from "../configs/theaterTypes.js";
import { toCinemaDate } from "../configs/cinemaTime.js";
import mongoose from 'mongoose';
import { startCheckout, releaseSeats, BookingError } from '../services/bookings.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "models/gemini-flash-latest",
    generationConfig: {
        responseMimeType: "application/json",
    }
});

/**
 * CineBot Tools implementation
 */
const tools = {
    search_movies: async ({ query, filters }) => {
        console.log(`[CineBot Tool] search_movies: ${query}`, filters);
        
        // Find movies that have shows TODAY or in the FUTURE
        const availableMovieIds = await Show.distinct('movie', { 
            showDateTime: { $gte: new Date() } 
        });
        
        let findQuery = { _id: { $in: availableMovieIds } };
        if (query) {
            findQuery.$and = [
                { _id: { $in: availableMovieIds } },
                {
                    $or: [
                        { title: { $regex: query, $options: 'i' } },
                        { overview: { $regex: query, $options: 'i' } }
                    ]
                }
            ];
        }
        
        const movies = await Movie.find(findQuery).limit(3);
        return movies;
    },

    get_showtimes: async ({ movie_id, date }) => {
        console.log(`[CineBot Tool] get_showtimes: ${movie_id}, ${date}`);
        let findQuery = { movie: movie_id };
        if (date) {
            const start = new Date(date);
            start.setHours(0,0,0,0);
            const end = new Date(start);
            end.setDate(start.getDate() + 1);
            findQuery.showDateTime = { $gte: start, $lt: end };
        } else {
            findQuery.showDateTime = { $gte: new Date() };
        }
        const shows = await Show.find(findQuery).sort({ showDateTime: 1 });
        return shows;
    },

    get_movie_details: async ({ movie_id }) => {
        console.log(`[CineBot Tool] get_movie_details: ${movie_id}`);
        const movie = await Movie.findById(movie_id);
        return movie;
    },

    book_ticket: async ({ user_id, timeslot_id, quantity }, origin) => {
        console.log(`[CineBot Tool] book_ticket: user:${user_id}, show:${timeslot_id}, qty:${quantity}`);
        const count = Number(quantity);
        if (!Number.isInteger(count) || count < 1 || count > 10) return { error: "Please choose between 1 and 10 tickets" };
        if (!mongoose.isValidObjectId(String(timeslot_id))) return { error: "Show not found" };
        const show = await Show.findById(String(timeslot_id)).select('occupiedSeats showDateTime').lean();
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
            const { booking, url } = await startCheckout({ userId: user_id, showId: String(show._id), seats, origin });
            return {
                booking_id: booking._id,
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
        console.log(`[CineBot Tool] get_booking: user:${user_id}`);
        let query = { user: user_id };
        if (booking_ref) query._id = booking_ref;
        const bookings = await Booking.find(query).populate({
            path: 'show',
            populate: { path: 'movie' }
        }).sort({ createdAt: -1 });
        return bookings;
    },

    cancel_booking: async ({ user_id, booking_ref }) => {
        console.log(`[CineBot Tool] cancel_booking: ${booking_ref}`);
        if (!mongoose.isValidObjectId(String(booking_ref))) return { error: "Booking not found or unauthorized" };
        const booking = await Booking.findOneAndDelete({ _id: String(booking_ref), user: user_id }).lean();
        if (!booking) return { error: "Booking not found or unauthorized" };
        await releaseSeats(booking.show, booking.bookedSeat);
        return { success: true };
    },

    get_recommendations: async ({ user_id }) => {
        console.log(`[CineBot Tool] get_recommendations: user:${user_id}`);
        // Only recommend movies that have active FUTURE shows
        const availableMovieIds = await Show.distinct('movie', { 
            showDateTime: { $gte: new Date() } 
        });
        const movies = await Movie.find({ _id: { $in: availableMovieIds } })
            .sort({ vote_average: -1 })
            .limit(3);
        return movies;
    }
};

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

export const chatHandler = async (req, res) => {
    try {
        const { message, context, history } = req.body;
        const auth = req.auth();
        const userId = auth ? auth.userId : null;
        const origin = req.headers.origin || 'http://localhost:5173';

        // Log for debugging
        console.log(`[CineBot] Message from ${userId || 'anonymous'}: "${message}"`);

        const prompt = `
        User ID: ${userId}
        History: ${JSON.stringify(history)}
        Context: ${JSON.stringify(context)}
        User Message: "${message}"

        Analyze the message and return the required JSON response.
        `;

        const result = await model.generateContent([SYSTEM_PROMPT, prompt]);
        const responseText = result.response.text();
        console.log("[CineBot] Raw LLM Response:", responseText);
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        const chatResponse = JSON.parse(cleanJson);

        // Execute tool if requested
        if (chatResponse.tool_call) {
            const toolName = chatResponse.tool_call.name;
            const params = chatResponse.tool_call.parameters;
            
            // Inject userId into protected tools
            if (['book_ticket', 'get_booking', 'cancel_booking', 'get_recommendations'].includes(toolName)) {
                params.user_id = userId;
            }

            try {
                const toolResult = await tools[toolName](params, origin);
                chatResponse.tool_result = toolResult;
            } catch (toolErr) {
                console.error(`Tool execution error: ${toolName}`, toolErr);
                chatResponse.tool_error = toolErr.message;
            }
        }

        res.json({ success: true, ...chatResponse });

    } catch (error) {
        console.error("[CineBot] Controller Error:", error);
        res.json({ success: false, message: "Oops! My circuits got a bit tangled 🤖 Try again in a moment." });
    }
};
