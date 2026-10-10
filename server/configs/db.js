import mongoose from "mongoose";

const connectDB = async () => {
    try {
        mongoose.connection.on('connected', () => console.log("Database connected"));

        const uri = process.env.MONGODB_URI;
        // MONGODB_DB overrides the database name, e.g. to point at the sample-data database
        const options = process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {};
        // If the URI already contains a database name or query params, don't append /quickshow blindly
        if (uri.includes('?') || uri.split('/').length > 3) {
            await mongoose.connect(uri, options);
        } else {
            await mongoose.connect(`${uri}/quickshow`, options);
        }
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
};

export default connectDB;
