import express from "express";

import {
  acknowledgeCurtailmentRecord,
  changeCurtailmentStatus,
  createCurtailmentRecord,
  getCurtailmentById,
  getCurtailmentOperationsRecord,
  listActiveCurtailments,
  listCurtailments,
  reportCurtailmentProblemRecord,
  reviseCurtailmentRecord,
} from "../controllers/curtailmentController.js";

const router = express.Router();

router.get(
  "/operations/all",
  getCurtailmentOperationsRecord
);

router.get(
  "/active",
  listActiveCurtailments
);

router.get(
  "/",
  listCurtailments
);

router.get(
  "/:id",
  getCurtailmentById
);

router.post(
  "/",
  createCurtailmentRecord
);

router.post(
  "/:id/revise",
  reviseCurtailmentRecord
);

router.patch(
  "/:id/status",
  changeCurtailmentStatus
);

router.post(
  "/:id/acknowledge",
  acknowledgeCurtailmentRecord
);

router.post(
  "/:id/report",
  reportCurtailmentProblemRecord
);

export default router;