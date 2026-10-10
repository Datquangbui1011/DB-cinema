import mongoose from "mongoose";

// Small key/value records about background jobs, e.g. the scheduler's last run
const systemStateSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false });

export default mongoose.model("SystemState", systemStateSchema);
