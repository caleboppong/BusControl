import express from "express";
import {
  createUser,
  deleteUser,
  listUsers,
  sendPasswordRecovery,
  updateUser,
} from "../controllers/adminController.js";
import {
  requireAuth,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN"));

router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.post(
  "/users/:id/password-recovery",
  sendPasswordRecovery
);
router.delete("/users/:id", deleteUser);

export default router;