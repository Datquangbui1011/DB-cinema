import Show from "../models/Show.js";
import Booking from "../models/Booking.js";


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
        const { userId } = req.auth();
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
        const booking = new Booking({
            user: userId,
            show: showId,
            bookedSeat: selectedSeats,
            amount: showData.showPrice * selectedSeats.length,

        })

        selectedSeats.map(seat => {
            showData.occupiedSeats[seat] = userId;
        })
        showData.markModified("occupiedSeats");
        await showData.save();


        //Stripe Gatewat Initialize
        res.json({ success: true, message: "Booking created successfully" })

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