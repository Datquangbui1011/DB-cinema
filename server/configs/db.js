import mongoose from "mongoose";

const connectDB = async () => {
    try {
        mongoose.connection.on('connected', () => console.log("Database connected"));

        const uri = process.env.MONGODB_URI;
        // If the URI already contains a database name or query params, don't append /quickshow blindly
        if (uri.includes('?') || uri.split('/').length > 3) {
            await mongoose.connect(uri);
        } else {
            await mongoose.connect(`${uri}/quickshow`);
        }
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
};

export default connectDB;
