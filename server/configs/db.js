import mongoose from "mongoose";

const connectDB = async () => {
    // If already connected, return
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        const uri = process.env.MONGODB_URI;

        // Disable command buffering to fail fast if connection is not established
        // This prevents the "buffering timed out" error and gives a more direct connection error
        mongoose.set('bufferCommands', false);

        await mongoose.connect(uri);
        console.log("Database connected");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        // In serverless, it's better to throw the error so the function fails and retries
        throw error;
    }
};

export default connectDB;
