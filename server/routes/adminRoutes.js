import express from "express";
import { protectAdmin, protectStaff } from "../middleware/auth.js";
import { isAdmin, getScreens, uploadHeroPoster, deleteHeroPoster, getHeroPosters, triggerMovieScheduler } from "../controllers/adminControllers.js";
import { getOverview } from "../controllers/overviewController.js";
import { getLiveOperations, getScheduleCalendar, getShowDetails } from "../controllers/liveController.js";
import upload from "../middleware/multer.js";
import { simulateTraffic } from "../simulator/trafficSimulator.js";
import { getAnalytics } from "../controllers/analyticsController.js";
import { listMovies, updateMovie, removeUnsoldShows, listScreensAdmin, updateScreen } from "../controllers/catalogController.js";
import { getSystemStatus, runSimulatorNow, listTeam, addTeamMember, updateTeamMember, revokeInvitation } from "../controllers/systemController.js";
import { listShows, getShowFilters, updateShow, cancelShow } from "../controllers/showsAdminController.js";
import { listBookings, exportBookings, getBookingDetails, listCustomers, getCustomerDetails } from "../controllers/salesAdminController.js";
import { refreshAdvisor } from "../controllers/advisorController.js";


const adminRouter = express.Router();

// Read-only: admin and staff
adminRouter.get("/is-admin", protectStaff, isAdmin);
adminRouter.get("/overview", protectStaff, simulateTraffic, getOverview);
adminRouter.get("/analytics", protectStaff, getAnalytics);
adminRouter.get("/live", protectStaff, simulateTraffic, getLiveOperations);
adminRouter.get("/schedule-calendar", protectStaff, getScheduleCalendar);
adminRouter.get("/shows/:id", protectStaff, getShowDetails);
adminRouter.get("/shows-table", protectStaff, listShows);
adminRouter.get("/shows-filters", protectStaff, getShowFilters);
adminRouter.get("/screens", protectStaff, getScreens);
adminRouter.get("/bookings-table", protectStaff, listBookings);
adminRouter.get("/bookings/:id", protectStaff, getBookingDetails);
adminRouter.get("/customers-table", protectStaff, listCustomers);
adminRouter.get("/customers/:id", protectStaff, getCustomerDetails);
adminRouter.get("/movies-table", protectStaff, listMovies);
adminRouter.get("/screens-admin", protectStaff, listScreensAdmin);

// Public: homepage slideshow
adminRouter.get("/hero-posters", getHeroPosters);

// Changes data: admin only
adminRouter.post("/upload-hero", protectAdmin, upload.single('image'), uploadHeroPoster);
adminRouter.post("/delete-hero", protectAdmin, deleteHeroPoster);
adminRouter.post("/schedule-movies", protectAdmin, triggerMovieScheduler);
adminRouter.patch("/shows/:id", protectAdmin, updateShow);
adminRouter.delete("/shows/:id", protectAdmin, cancelShow);
adminRouter.get("/bookings-export", protectAdmin, exportBookings);
adminRouter.patch("/movies/:id", protectAdmin, updateMovie);
adminRouter.delete("/movies/:id/upcoming-shows", protectAdmin, removeUnsoldShows);
adminRouter.patch("/screens/:id", protectAdmin, updateScreen);
adminRouter.get("/system", protectAdmin, getSystemStatus);
adminRouter.post("/simulator/run", protectAdmin, runSimulatorNow);
adminRouter.post("/advisor/refresh", protectAdmin, refreshAdvisor);
adminRouter.get("/team", protectAdmin, listTeam);
adminRouter.post("/team", protectAdmin, addTeamMember);
adminRouter.patch("/team/:userId", protectAdmin, updateTeamMember);
adminRouter.delete("/team/invitations/:id", protectAdmin, revokeInvitation);

export default adminRouter;
