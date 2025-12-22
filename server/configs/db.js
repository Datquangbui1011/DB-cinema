import mongoose from "mongoose";

const connectDB = async () => {
    // If already connected, return
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        let uri = process.env.MONGODB_URI;

        // Ensure we connect to the 'quickshow' database if not specified in the URI
        if (!uri.includes('?') && !uri.split('/').slice(3).join('/').includes('/')) {
            uri = `${uri.replace(/\/$/, '')}/quickshow`;
        }

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
