import mongoose from "mongoose";

// Remembers how far the traffic simulator has caught up
const simulatorStateSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    lastRunAt: { type: Date, required: true },
    lastUserDay: { type: String, default: null },  // cinema-local date new customers were last added
}, { timestamps: true });

export default mongoose.model("SimulatorState", simulatorStateSchema);
