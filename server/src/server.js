import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import tflRoutes from "./routes/tflRoutes.js";
import analysisRoutes from "./routes/analysisRoutes.js";
import diversionRoutes from "./routes/diversionRoutes.js";
import curtailmentRoutes from "./routes/curtailmentRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tfl", tflRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/diversions", diversionRoutes);
app.use("/api/curtailments", curtailmentRoutes);

app.get("/api", (req, res) => {
  res.json({
    success: true,
    name: "BusControl API",
    version: "1.0.0",
    description:
      "Live Bus Diversion Management System",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "BusControl API",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message:
      "BusControl API route not found",
  });
});

app.listen(PORT, () => {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(" BusControl API");
  console.log(
    "========================================"
  );
  console.log(
    ` Server running on http://localhost:${PORT}`
  );
  console.log(
    ` Health: http://localhost:${PORT}/api/health`
  );
  console.log(
    "========================================"
  );
  console.log("");
});