import express from "express";
import multer from "multer";
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
import initMovieScheduler from "./scheduler/movieScheduler.js";
import botRouter from "./routes/botRoutes.js";
import cronRouter from "./routes/cronRoutes.js";
import { stripeWebhook } from "./controllers/bookingController.js";
const app = express();
const port = process.env.PORT || 3000;


// Connect to Database
// await connectDB(); // Removed top-level await to prevent cold start crashes

// Connect to Database and Cloudinary
if (!process.env.VERCEL) {
    connectDB(); 
    connectCloudinary();
    initBookingScheduler();
    initMovieScheduler();
} else {
    // On Vercel, we still want to ensure Cloudinary is configured at start
    connectCloudinary();
}

// Global Middleware
app.use(cors());

// Stripe needs the raw body to verify its signature, so this route comes before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    await connectDB();
    next();
}, stripeWebhook);

app.use(express.json());

// Inngest Route (Must be before Auth/Clerk middleware to avoid auth issues)
app.use('/api/inngest', serve({ 
  client: inngest, 
  functions 
}));

// DB Connection Middleware for Vercel
app.use(async (req, res, next) => {
    await connectDB();
    // Ensure Cloudinary is configured (it's fast/idempotent)
    connectCloudinary();
    next();
});

// Clerk Middleware
app.use(clerkMiddleware())


//API routes
app.get('/', (req, res) => res.send('Server is Live!'));
app.use('/api/shows', showRouter);
app.use('/api/booking', bookingRouter);
if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}
app.use('/api/admin', adminRouter);
app.use('/api/user', userRouter);
app.use('/api/bot', botRouter);
app.use('/api/cron', cronRouter);

// Last resort for errors passed to next(): a clean message, never internals.
// Upload rejections (size/type) and bad request bodies are explained to the caller.
app.use((err, req, res, next) => {
    console.error('[Server]', req.method, req.path, err.message);
    const status = err.status || err.statusCode || (err instanceof multer.MulterError ? 400 : 500);
    const uploadProblem = err instanceof multer.MulterError || /^Please upload/.test(err.message);
    const message = uploadProblem ? (err.code === 'LIMIT_FILE_SIZE' ? 'That image is too large (max 8 MB)' : err.message)
        : status < 500 ? 'The request could not be read.' : 'Something went wrong. Please try again.';
    res.status(uploadProblem ? 400 : status).json({ success: false, message });
});

export default app;
