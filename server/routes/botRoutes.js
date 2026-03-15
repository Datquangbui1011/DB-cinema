import express from "express";
import { chatHandler } from "../controllers/botController.js";
import { protectAdmin } from "../middleware/auth.js"; // Not needed if bot is for users, but middleware might be useful
import { requireAuth } from "@clerk/express";

const botRouter = express.Router();

// protect with Clerk auth inside the controller if needed
botRouter.post("/chat", chatHandler);

export default botRouter;
