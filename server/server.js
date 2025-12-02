import express from "express";
import cors from "cors";
import 'dotenv/config';
import connectDB from "./configs/db.js";
import { clerkMiddleware } from '@clerk/express'
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js"
import showRouter from "./routes/showRoutes.js";

const app = express();
const port = 3000;


await connectDB();

//Middleware
app.use(cors());
app.use(express.json());
app.use(clerkMiddleware())


//API routes
app.get('/', (req, res) => res.send('Server is Live!'));
app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/show', showRouter);
if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}

export default app;
