import express from "express";
import { chatHandler } from "../controllers/botController.js";
import { rateLimit } from "../middleware/rateLimit.js";

const botRouter = express.Router();

// Anyone can ask about movies (rate-limited to protect the AI quota); booking and
// managing tickets require sign-in, enforced per tool in the controller
botRouter.post("/chat", rateLimit({ name: 'bot', windowMs: 10 * 60_000, limit: 15, signedInLimit: 40, message: "You're sending messages quickly. Please wait a few minutes and try again." }), chatHandler);

export default botRouter;
