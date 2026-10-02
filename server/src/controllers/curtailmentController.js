import {
  acknowledgeCurtailment,
  createCurtailment,
  getActiveCurtailments,
  getCurtailment,
  getCurtailmentOperations,
  getCurtailments,
  reportCurtailmentProblem,
  reviseCurtailment,
  setCurtailmentStatus,
} from "../services/curtailment/curtailmentService.js";

function success(
  res,
  data,
  status = 200
) {
  return res
    .status(status)
    .json({
      success: true,
      ...data,
    });
}

function failure(
  res,
  error,
  status = 400
) {
  console.error(error);

  return res
    .status(status)
    .json({
      success: false,
      message:
        error?.message ||
        "Curtailment request failed.",
    });
}

export async function listCurtailments(
  req,
  res
) {
  try {
    const curtailments =
      await getCurtailments();

    return success(res, {
      count:
        curtailments.length,
      curtailments,
    });
  } catch (error) {
    return failure(
      res,
      error,
      500
    );
  }
}

export async function listActiveCurtailments(
  req,
  res
) {
  try {
    const curtailments =
      await getActiveCurtailments();

    return success(res, {
      count:
        curtailments.length,
      curtailments,
    });
  } catch (error) {
    return failure(
      res,
      error,
      500
    );
  }
}

export async function getCurtailmentById(
  req,
  res
) {
  try {
    const curtailment =
      await getCurtailment(
        req.params.id
      );

    if (!curtailment) {
      return failure(
        res,
        new Error(
          "Curtailment not found."
        ),
        404
      );
    }

    return success(res, {
      curtailment,
    });
  } catch (error) {
    return failure(
      res,
      error,
      500
    );
  }
}

export async function createCurtailmentRecord(
  req,
  res
) {
  try {
    const curtailment =
      await createCurtailment(
        req.body
      );

    return success(
      res,
      {
        message:
          "Curtailment proposed successfully.",
        curtailment,
      },
      201
    );
  } catch (error) {
    return failure(
      res,
      error
    );
  }
}

export async function reviseCurtailmentRecord(
  req,
  res
) {
  try {
    const curtailment =
      await reviseCurtailment(
        req.params.id,
        req.body
      );

    return success(
      res,
      {
        message:
          "Curtailment revision created successfully.",
        curtailment,
      },
      201
    );
  } catch (error) {
    const status =
      error?.message ===
      "Curtailment not found."
        ? 404
        : 400;

    return failure(
      res,
      error,
      status
    );
  }
}

export async function changeCurtailmentStatus(
  req,
  res
) {
  try {
    const {
      status,
      controllerName,
    } = req.body;

    if (!status) {
      throw new Error(
        "Curtailment status is required."
      );
    }

    const curtailment =
      await setCurtailmentStatus(
        req.params.id,
        status,
        controllerName
      );

    return success(res, {
      message:
        `Curtailment ${curtailment.reference} is now ${curtailment.status}.`,
      curtailment,
    });
  } catch (error) {
    const statusCode =
      error?.message ===
      "Curtailment not found."
        ? 404
        : 400;

    return failure(
      res,
      error,
      statusCode
    );
  }
}

export async function acknowledgeCurtailmentRecord(
  req,
  res
) {
  try {
    const {
      driverName,
      vehicleId,
    } = req.body;

    const acknowledgement =
      await acknowledgeCurtailment(
        req.params.id,
        driverName,
        vehicleId
      );

    return success(
      res,
      {
        message:
          "Curtailment acknowledged.",
        acknowledgement,
      },
      201
    );
  } catch (error) {
    const status =
      error?.message ===
      "Curtailment not found."
        ? 404
        : 400;

    return failure(
      res,
      error,
      status
    );
  }
}

export async function reportCurtailmentProblemRecord(
  req,
  res
) {
  try {
    const {
      message,
      driverName,
      vehicleId,
    } = req.body;

    const report =
      await reportCurtailmentProblem(
        req.params.id,
        message,
        driverName,
        vehicleId
      );

    return success(
      res,
      {
        message:
          "Curtailment problem reported.",
        report,
      },
      201
    );
  } catch (error) {
    const status =
      error?.message ===
      "Curtailment not found."
        ? 404
        : 400;

    return failure(
      res,
      error,
      status
    );
  }
}

export async function getCurtailmentOperationsRecord(
  req,
  res
) {
  try {
    const operations =
      await getCurtailmentOperations();

    return success(
      res,
      operations
    );
  } catch (error) {
    return failure(
      res,
      error,
      500
    );
  }
}