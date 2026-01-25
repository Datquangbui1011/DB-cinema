import express from "express";
import cors from "cors";
import 'dotenv/config';
import connectDB from "./configs/db.js";
import connectCloudinary from "./configs/cloudinary.js";
import { clerkMiddleware } from '@clerk/express'
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js"
import showRouter from "./routes/showRoutes.js";
import bookingRouter from "./routes/bookingRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import userRouter from "./routes/userRoutes.js";
import initBookingScheduler from "./scheduler/bookingScheduler.js";
const app = express();
const port = 3000;


// Connect to Database
// await connectDB(); // Removed top-level await to prevent cold start crashes

// Only run scheduler in non-vercel environments
if (!process.env.VERCEL) {
    connectDB(); // Connect immediately in local/persistent environments
    connectCloudinary();
    initBookingScheduler();
}

//Middleware
app.use(cors());
app.use(express.json());
app.use(clerkMiddleware())

// DB Connection Middleware for Vercel
app.use(async (req, res, next) => {
    await connectDB();
    next();
});


//API routes
app.get('/', (req, res) => res.send('Server is Live!'));
app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/shows', showRouter);
app.use('/api/booking', bookingRouter);
if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}
app.use('/api/admin', adminRouter);
app.use('/api/user', userRouter);
export default app;
