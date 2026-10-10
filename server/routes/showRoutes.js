import express from "express";
import { addShow, getNowPlayingMovies, getShows, getShow } from "../controllers/showController.js";
import { protectAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";


const showRouter = express.Router();
// These call TMDB, so they are rate-limited per caller
showRouter.get('/now-playing', rateLimit({ name: 'now-playing', windowMs: 10 * 60_000, limit: 30 }), getNowPlayingMovies);
showRouter.post('/add', protectAdmin, addShow);
showRouter.get('/all', getShows);
showRouter.get('/:movieId', rateLimit({ name: 'show', windowMs: 10 * 60_000, limit: 200 }), getShow);
export default showRouter;