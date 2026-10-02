import express from "express";
import {
  generateDiversion,
  calculateManualDiversionRoute,
  acceptManualDiversionRoute,
  listDiversions,
  updateDiversionStatus,
  acknowledgeDiversion,
  reportProblem,
  operationalData,
} from "../controllers/diversionController.js";

const router = express.Router();

router.get("/", listDiversions);
router.post("/generate", generateDiversion);
router.post("/:id/manual-route", calculateManualDiversionRoute);
router.post("/:id/manual-route/accept", acceptManualDiversionRoute);
router.patch("/:id/status", updateDiversionStatus);
router.post("/:id/acknowledge", acknowledgeDiversion);
router.post("/:id/report", reportProblem);
router.get("/operations/all", operationalData);

export default router;
