import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import Stripe from 'stripe';
import transporter from "../config/emailConfig.js";
import { clerkClient } from "@clerk/express";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const theaterPremiums = {
    'Standard': 0,
    'IMAX': 5,
    'Premium': 15
};


//Functions to check available seats
const checkSeatAvailability = async (showId, seats) => {
    try {
        const showData = await Show.findById(showId);
        if (!showData) {
            throw new Error("Show not found");
        }
        const occupiedSeats = showData.occupiedSeats;
        const isAnySeatTaken = seats.some(seat => occupiedSeats[seat]);
        return !isAnySeatTaken;
    } catch (error) {
        console.log(error.message)
        return false;
    }
}

//Function for booking seats
export const createBooking = async (req, res) => {
    try {
        // Get auth object and log for debugging
        const auth = req.auth();
        console.log("Auth object:", JSON.stringify(auth, null, 2));

        const { userId } = auth;

        // Validate userId is present
        if (!userId) {
            console.error("Authentication failed: userId is missing from auth object");
            console.error("Full auth object:", auth);
            return res.json({ success: false, message: "Authentication required. Please log in." });
        }

        console.log("Creating booking for userId:", userId);
        const { showId, selectedSeats } = req.body;
        const { origin } = req.headers;

        //check if the seat is available
        const isSeatAvailable = await checkSeatAvailability(showId, selectedSeats);
        if (!isSeatAvailable) {
            return res.json({ success: false, message: "Seat is not available" })
        }

        //Get the show details
        const showData = await Show.findById(showId).populate("movie");


        //create new booking
        const theaterPremium = theaterPremiums[showData.theaterType] || 0;
        const totalUnitPrice = showData.showPrice + theaterPremium;

        const booking = new Booking({
            user: userId,
            show: showId,
            bookedSeat: selectedSeats,
            amount: totalUnitPrice * selectedSeats.length,
        })

        await booking.save();

        selectedSeats.map(seat => {
            showData.occupiedSeats[seat] = userId;
        })
        showData.markModified("occupiedSeats");
        await showData.save();


        //Stripe Gatewat Initialize
        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${showData.movie.title} (${showData.theaterType})`,
                        },
                        unit_amount: (showData.showPrice + (theaterPremiums[showData.theaterType] || 0)) * 100,
                    },
                    quantity: selectedSeats.length,
                },
            ],
            mode: 'payment',
            metadata: {
                bookingId: booking._id.toString(),
            },
        });

        res.json({ success: true, message: "Booking created successfully", url: session.url })

    } catch (error) {
        console.log(error.message)
        return res.json({ success: false, message: error.message })
    }
}

export const getOccupiedSeats = async (req, res) => {
    try {
        const { showId } = req.params;
        const showData = await Show.findById(showId);
        const occupiedSeats = Object.keys(showData.occupiedSeats);
        return res.json({ success: true, occupiedSeats })
    } catch (error) {
        console.log(error.message)
        return res.json({ success: false, message: error.message })
    }
}

export const cancelBooking = async (req, res) => {
    try {
        const auth = req.auth();
        const { userId } = auth;

        // Validate userId is present
        if (!userId) {
            console.error("Authentication failed: userId is missing");
            return res.json({ success: false, message: "Authentication required. Please log in." });
        }

        console.log("Cancelling booking for userId:", userId);
        const { bookingId } = req.body;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.json({ success: false, message: "Booking not found" });
        }

        if (booking.user !== userId) {
            return res.json({ success: false, message: "Unauthorized action" });
        }

        const showData = await Show.findById(booking.show);
        if (showData) {
            booking.bookedSeat.forEach(seat => {
                delete showData.occupiedSeats[seat];
            });
            showData.markModified("occupiedSeats");
            await showData.save();
        }

        await Booking.findByIdAndDelete(bookingId);

        res.json({ success: true, message: "Booking cancelled successfully" });

    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
}

export const verifyStripe = async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
            const bookingId = session.metadata.bookingId;
            const booking = await Booking.findByIdAndUpdate(bookingId, { isPaid: true, paymentLink: session.id }).populate({
                path: 'show',
                populate: {
                    path: 'movie'
                }
            });

            // Send confirmation email
            try {
                const user = await clerkClient.users.getUser(booking.user);
                console.log("Fetching user from Clerk:", booking.user);

                if (user) {
                    const email = user.emailAddresses[0]?.emailAddress;
                    console.log("Sending email to:", email);

                    if (email) {
                        const mailOptions = {
                            from: process.env.EMAIL_USER,
                            to: email,
                            subject: 'Booking Confirmation - Movie Ticket Booking',
                            html: `
                                <h1>Booking Confirmed!</h1>
                                <p>Thank you for your booking, ${user.firstName || 'User'}.</p>
                                <p><strong>Movie:</strong> ${booking.show.movie.title}</p>
                                <p><strong>Seats:</strong> ${booking.bookedSeat.join(', ')}</p>
                                <p><strong>Date:</strong> ${new Date(booking.show.showDateTime).toLocaleString()}</p>
                                <p><strong>Amount Paid:</strong> $${booking.amount}</p>
                                <p>Enjoy the show!</p>
                            `
                        };

                        transporter.sendMail(mailOptions, (error, info) => {
                            if (error) {
                                console.log('Error sending email:', error);
                            } else {
                                console.log('Email sent:', info.response);
                            }
                        });
                    } else {
                        console.log("User has no email address.");
                    }
                } else {
                    console.log("User not found in Clerk.");
                }
            } catch (err) {
                console.log("Error fetching user from Clerk:", err);
            }

            res.json({ success: true, message: "Payment successful" });
        } else {
            res.json({ success: false, message: "Payment failed" });
        }
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
}


export const createPaymentSession = async (req, res) => {
    try {
        const auth = req.auth();
        const { userId } = auth;

        // Validate userId is present
        if (!userId) {
            console.error("Authentication failed: userId is missing");
            return res.json({ success: false, message: "Authentication required. Please log in." });
        }

        console.log("Creating payment session for userId:", userId);
        const { bookingId } = req.body;
        const { origin } = req.headers;

        const booking = await Booking.findById(bookingId).populate({
            path: 'show',
            populate: {
                path: 'movie'
            }
        });

        if (!booking) {
            return res.json({ success: false, message: "Booking not found" });
        }

        if (booking.user !== userId) {
            return res.json({ success: false, message: "Unauthorized action" });
        }

        if (booking.isPaid) {
            return res.json({ success: false, message: "Booking is already paid" });
        }

        const showData = booking.show;

        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/result?session_id={CHECKOUT_SESSION_ID}`,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${showData.movie.title} (${showData.theaterType})`,
                        },
                        unit_amount: (showData.showPrice + (theaterPremiums[showData.theaterType] || 0)) * 100,
                    },
                    quantity: booking.bookedSeat.length,
                },
            ],
            mode: 'payment',
            metadata: {
                bookingId: booking._id.toString(),
            },
        });

        res.json({ success: true, url: session.url });

    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
}