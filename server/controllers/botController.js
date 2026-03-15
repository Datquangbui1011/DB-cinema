import { GoogleGenerativeAI } from "@google/generative-ai";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import { clerkClient } from "@clerk/express";
import Stripe from 'stripe';

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

    book_ticket: async ({ user_id, movie_id, timeslot_id, quantity, seat_preference }, origin) => {
        console.log(`[CineBot Tool] book_ticket: user:${user_id}, show:${timeslot_id}, qty:${quantity}`);
        const show = await Show.findById(timeslot_id).populate('movie');
        if (!show) return { error: "Show not found" };

        // Simple seat selection (pick available ones)
        const availableSeats = [];
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        for (let r of rows) {
            for (let i = 1; i <= 10; i++) {
                const s = `${r}${i}`;
                if (!show.occupiedSeats[s]) availableSeats.push(s);
                if (availableSeats.length >= quantity) break;
            }
            if (availableSeats.length >= quantity) break;
        }

        if (availableSeats.length < quantity) return { error: "Not enough seats available" };

        const theaterPremiums = { 'Standard': 0, 'IMAX': 5, 'Premium': 15 };
        const price = (show.showPrice + (theaterPremiums[show.theaterType] || 0));

        // Create booking
        const booking = new Booking({
            user: user_id,
            show: timeslot_id,
            bookedSeat: availableSeats,
            amount: price * quantity,
        });
        await booking.save();

        // Mark seats as occupied
        availableSeats.forEach(s => { show.occupiedSeats[s] = user_id; });
        show.markModified("occupiedSeats");
        await show.save();

        // Stripe Session
        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: `${show.movie.title} (${show.theaterType})` },
                    unit_amount: price * 100,
                },
                quantity: quantity,
            }],
            mode: 'payment',
            metadata: { bookingId: booking._id.toString() },
        });

        return {
            booking_id: booking._id,
            movie: show.movie.title,
            date: show.showDateTime.toISOString().split('T')[0],
            time: show.showDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            seats: availableSeats.join(', '),
            total: price * quantity,
            payment_url: session.url
        };
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
        const booking = await Booking.findById(booking_ref);
        if (!booking || booking.user !== user_id) return { error: "Booking not found or unauthorized" };

        const show = await Show.findById(booking.show);
        if (show) {
            booking.bookedSeat.forEach(s => { delete show.occupiedSeats[s]; });
            show.markModified("occupiedSeats");
            await show.save();
        }
        await Booking.findByIdAndDelete(booking_ref);
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
