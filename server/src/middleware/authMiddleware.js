import supabase from "../services/supabase.js";

export async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session.",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, employee_number, operator_name, is_active"
      )
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({
        success: false,
        message: "BusControl profile not found.",
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: "This BusControl account is inactive.",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: profile.full_name,
      role: profile.role,
      employeeNumber: profile.employee_number,
      operatorName: profile.operator_name,
    };

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify authentication.",
    });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
    }

    next();
  };
}