import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
    user: { type: String, required: true, ref: "User" },
    show: { type: String, required: true, ref: "Show" },
    bookedSeat: { type: Array, required: true },
    amount: { type: Number, required: true },
    isPaid: { type: Boolean, default: false },
    paymentLink: { type: String },
}, { timestamps: true })

bookingSchema.index({ isPaid: 1, createdAt: -1 });
bookingSchema.index({ show: 1 });

export default mongoose.model("Booking", bookingSchema);