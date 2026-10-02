import supabase from "../services/supabase.js";

const VALID_ROLES = [
  "SUPER_ADMIN",
  "CONTROLLER",
  "DRIVER",
];

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normaliseRole(value) {
  const role = clean(value).toUpperCase();

  return VALID_ROLES.includes(role)
    ? role
    : null;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, employee_number, operator_name, is_active, created_at, updated_at"
    )
    .eq("id", userId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

async function countActiveSuperAdmins() {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("role", "SUPER_ADMIN")
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return count || 0;
}

async function wouldRemoveLastSuperAdmin(
  profile,
  nextRole,
  nextActive
) {
  if (
    profile.role !== "SUPER_ADMIN" ||
    !profile.is_active
  ) {
    return false;
  }

  const remainsActiveSuperAdmin =
    nextRole === "SUPER_ADMIN" &&
    nextActive === true;

  if (remainsActiveSuperAdmin) {
    return false;
  }

  const count = await countActiveSuperAdmins();

  return count <= 1;
}

export async function listUsers(req, res) {
  try {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authError) {
      throw authError;
    }

    const { data: profiles, error: profileError } =
      await supabase
        .from("profiles")
        .select(
          "id, full_name, role, employee_number, operator_name, is_active, created_at, updated_at"
        );

    if (profileError) {
      throw profileError;
    }

    const profileMap = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        profile,
      ])
    );

    const users = (authData?.users || []).map(
      (authUser) => {
        const profile = profileMap.get(authUser.id);

        return {
          id: authUser.id,
          email: authUser.email || "",
          emailConfirmed:
            Boolean(authUser.email_confirmed_at),
          lastSignInAt:
            authUser.last_sign_in_at || null,
          createdAt:
            authUser.created_at || null,
          fullName:
            profile?.full_name || "",
          role:
            profile?.role || "DRIVER",
          employeeNumber:
            profile?.employee_number || "",
          operatorName:
            profile?.operator_name || "",
          isActive:
            profile?.is_active ?? true,
          profileCreatedAt:
            profile?.created_at || null,
          profileUpdatedAt:
            profile?.updated_at || null,
        };
      }
    );

    users.sort((a, b) => {
      if (a.role === "SUPER_ADMIN" &&
          b.role !== "SUPER_ADMIN") {
        return -1;
      }

      if (a.role !== "SUPER_ADMIN" &&
          b.role === "SUPER_ADMIN") {
        return 1;
      }

      return a.fullName.localeCompare(
        b.fullName
      );
    });

    return res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("List users error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load BusControl users.",
    });
  }
}

export async function createUser(req, res) {
  let createdUserId = null;

  try {
    const email = clean(req.body.email).toLowerCase();
    const password = req.body.password || "";
    const fullName = clean(req.body.fullName);
    const role = normaliseRole(req.body.role);
    const employeeNumber = clean(
      req.body.employeeNumber
    );
    const operatorName = clean(
      req.body.operatorName
    );

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "A valid role is required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Temporary password must contain at least 8 characters.",
      });
    }

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authError) {
      throw authError;
    }

    createdUserId = authData?.user?.id;

    if (!createdUserId) {
      throw new Error(
        "Supabase did not return the new user."
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .upsert(
        {
          id: createdUserId,
          full_name: fullName,
          role,
          employee_number:
            employeeNumber || null,
          operator_name:
            operatorName || null,
          is_active: true,
        },
        {
          onConflict: "id",
        }
      )
      .select(
        "id, full_name, role, employee_number, operator_name, is_active, created_at, updated_at"
      )
      .single();

    if (profileError) {
      throw profileError;
    }

    return res.status(201).json({
      success: true,
      message: "BusControl user created.",
      user: {
        id: createdUserId,
        email,
        fullName: profile.full_name,
        role: profile.role,
        employeeNumber:
          profile.employee_number || "",
        operatorName:
          profile.operator_name || "",
        isActive: profile.is_active,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);

    if (createdUserId) {
      try {
        await supabase.auth.admin.deleteUser(
          createdUserId
        );
      } catch (cleanupError) {
        console.error(
          "Create user cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to create BusControl user.",
    });
  }
}

export async function updateUser(req, res) {
  try {
    const userId = req.params.id;

    const profile = await getProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "BusControl user not found.",
      });
    }

    const fullName =
      req.body.fullName !== undefined
        ? clean(req.body.fullName)
        : profile.full_name;

    const role =
      req.body.role !== undefined
        ? normaliseRole(req.body.role)
        : profile.role;

    const employeeNumber =
      req.body.employeeNumber !== undefined
        ? clean(req.body.employeeNumber)
        : profile.employee_number || "";

    const operatorName =
      req.body.operatorName !== undefined
        ? clean(req.body.operatorName)
        : profile.operator_name || "";

    const isActive =
      req.body.isActive !== undefined
        ? Boolean(req.body.isActive)
        : profile.is_active;

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "A valid role is required.",
      });
    }

    const removesLastAdmin =
      await wouldRemoveLastSuperAdmin(
        profile,
        role,
        isActive
      );

    if (removesLastAdmin) {
      return res.status(409).json({
        success: false,
        message:
          "BusControl must have at least one active Super Admin.",
      });
    }

    if (
      userId === req.user.id &&
      !isActive
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot deactivate your own account.",
      });
    }

    const { error: authError } =
      await supabase.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            full_name: fullName,
          },
        }
      );

    if (authError) {
      throw authError;
    }

    const {
      data: updated,
      error: profileError,
    } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        employee_number:
          employeeNumber || null,
        operator_name:
          operatorName || null,
        is_active: isActive,
      })
      .eq("id", userId)
      .select(
        "id, full_name, role, employee_number, operator_name, is_active, created_at, updated_at"
      )
      .single();

    if (profileError) {
      throw profileError;
    }

    return res.json({
      success: true,
      message: "BusControl user updated.",
      user: {
        id: updated.id,
        fullName: updated.full_name,
        role: updated.role,
        employeeNumber:
          updated.employee_number || "",
        operatorName:
          updated.operator_name || "",
        isActive: updated.is_active,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update BusControl user.",
    });
  }
}

export async function deleteUser(req, res) {
  try {
    const userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot delete your own account.",
      });
    }

    const profile = await getProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "BusControl user not found.",
      });
    }

    if (
      profile.role === "SUPER_ADMIN" &&
      profile.is_active
    ) {
      const count =
        await countActiveSuperAdmins();

      if (count <= 1) {
        return res.status(409).json({
          success: false,
          message:
            "BusControl must have at least one active Super Admin.",
        });
      }
    }

    const { error } =
      await supabase.auth.admin.deleteUser(
        userId
      );

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      message: "BusControl user deleted.",
    });
  } catch (error) {
    console.error("Delete user error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to delete BusControl user.",
    });
  }
}

export async function sendPasswordRecovery(
  req,
  res
) {
  try {
    const userId = req.params.id;

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.admin.getUserById(
      userId
    );

    if (authError || !authData?.user) {
      return res.status(404).json({
        success: false,
        message: "BusControl user not found.",
      });
    }

    const email = authData.user.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message:
          "This account does not have an email address.",
      });
    }

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email
      );

    if (error) {
      throw error;
    }

    return res.json({
      success: true,
      message:
        "Password recovery email requested.",
    });
  } catch (error) {
    console.error(
      "Password recovery error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to request password recovery.",
    });
  }
}