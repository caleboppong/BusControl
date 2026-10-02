import express from "express";
import {
  analyseRoute,
  analyseIncidentOnRoute,
  detectAffectedRoutes,
} from "../controllers/routeAnalysisController.js";

const router = express.Router();

router.get(
  "/incident/:incidentId/routes",
  detectAffectedRoutes
);

router.get(
  "/route/:lineId",
  analyseRoute
);

router.get(
  "/route/:lineId/incident/:incidentId",
  analyseIncidentOnRoute
);

export default router;