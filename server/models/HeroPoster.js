import mongoose from "mongoose";

const heroPosterSchema = new mongoose.Schema({
    imageUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    active: { type: Boolean, default: true },
}, { timestamps: true })

const HeroPoster = mongoose.model("HeroPoster", heroPosterSchema);

export default HeroPoster;
