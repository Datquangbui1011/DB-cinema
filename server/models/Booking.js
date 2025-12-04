import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
    user: { type: String, required: true, ref: "User" },
    show: { type: String, required: true, ref: "Show" },
    bookedSeat: { type: Array, required: true },
    amount: { type: Number, required: true },
    isPaid: { type: Boolean, default: false },
    paymentLink: { type: String },
}, { timestamps: true })

export default mongoose.model("Booking", bookingSchema);