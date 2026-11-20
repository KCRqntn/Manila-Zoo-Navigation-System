import { Router, type IRouter } from "express";
import healthRouter from "./health";
import animalsRouter from "./animals";
import categoriesRouter from "./categories";
import mapRouter from "./map";
import qrRouter from "./qr";
import chatRouter from "./chat";
import faqRouter from "./faq";
import favoritesRouter from "./favorites";
import animalFeedbackRouter from "./animalFeedback";
import gamesRouter from "./games";
import locationRouter from "./location";
import uploadsRouter from "./uploads";
import analyticsRouter from "./analytics";
import usersRouter from "./users";
import announcementsRouter from "./announcements";
import eventsRouter from "./events";
import trainingRouter from "./training";
import authRouter from "./auth";
import datasetsRouter from "./datasets";
import settingsRouter from "./settings";
import submissionsRouter from "./submissions";
import visitorRegistrationsRouter from "./visitorRegistrations";
import auditLogsRouter from "./auditLogs";
import backupRouter from "./backup";
import adminAccountsRouter from "./adminAccounts";
import rewardsRouter from "./rewards";
import parkAreasRouter from "./parkAreas";
import imagesRouter from "./images";

const router: IRouter = Router();

router.use(healthRouter);
// Small copies of uploaded photos for cards and lists
router.use(imagesRouter);
router.use(animalsRouter);
router.use(categoriesRouter);
router.use(mapRouter);
router.use(locationRouter);
router.use(uploadsRouter);
router.use(qrRouter);
router.use(chatRouter);
router.use(faqRouter);
// Before favoritesRouter so /favorites/counts isn't taken for a favorite id
router.use(animalFeedbackRouter);
router.use(favoritesRouter);
router.use(analyticsRouter);
router.use(usersRouter);
router.use(announcementsRouter);
router.use(eventsRouter);
router.use(gamesRouter);
router.use(trainingRouter);
router.use(authRouter);
router.use(datasetsRouter);
router.use(settingsRouter);
router.use(submissionsRouter);
router.use(visitorRegistrationsRouter);
router.use(auditLogsRouter);
router.use(backupRouter);
router.use(adminAccountsRouter);
router.use(rewardsRouter);
// Facilities and Park Areas (zones and their trees), shown on the 3D map
router.use(parkAreasRouter);

export default router;
