import express from "express";
import {
  getRoadDisruptions,
  getBusLines,
  getLineStatus,
  getLineRoute,
  getLineArrivals,
} from "../services/tfl/tflService.js";

const router = express.Router();

router.get("/disruptions", async (req, res) => {
  try {
    const disruptions = await getRoadDisruptions();

    res.json({
      success: true,
      count: disruptions.length,
      disruptions,
    });
  } catch (error) {
    console.error("TfL disruption error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve TfL road disruptions.",
    });
  }
});

router.get("/lines", async (req, res) => {
  try {
    const lines = await getBusLines();

    res.json({
      success: true,
      count: lines.length,
      lines,
    });
  } catch (error) {
    console.error("TfL lines error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve TfL bus lines.",
    });
  }
});

router.get("/line/:lineId/status", async (req, res) => {
  try {
    const data = await getLineStatus(req.params.lineId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to retrieve line status.",
    });
  }
});

router.get("/line/:lineId/route", async (req, res) => {
  try {
    const data = await getLineRoute(req.params.lineId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to retrieve route information.",
    });
  }
});

router.get("/line/:lineId/arrivals", async (req, res) => {
  try {
    const data = await getLineArrivals(req.params.lineId);

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to retrieve arrivals.",
    });
  }
});

export default router;