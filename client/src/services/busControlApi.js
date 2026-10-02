import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export const getRoadDisruptions = async () =>
  (await api.get("/tfl/disruptions")).data;

export const getBusLines = async () => (await api.get("/tfl/lines")).data;

export const getLineStatus = async (id) =>
  (await api.get(`/tfl/line/${encodeURIComponent(id)}/status`)).data;

export const getLineRoute = async (id) =>
  (await api.get(`/tfl/line/${encodeURIComponent(id)}/route`)).data;

export const getLineArrivals = async (id) =>
  (await api.get(`/tfl/line/${encodeURIComponent(id)}/arrivals`)).data;

export const analyseRoute = async (lineId, direction = "outbound") =>
  (
    await api.get(`/analysis/route/${encodeURIComponent(lineId)}`, {
      params: {
        direction,
      },
    })
  ).data;

export const analyseIncident = async (
  lineId,
  incidentId,
  direction = "outbound",
) =>
  (
    await api.get(
      `/analysis/route/${encodeURIComponent(
        lineId,
      )}/incident/${encodeURIComponent(incidentId)}`,
      {
        params: {
          direction,
        },
      },
    )
  ).data;

export const detectAffectedRoutes = async (
  incidentId,
  radius = 250,
  stopRadius = 500,
) =>
  (
    await api.get(
      `/analysis/incident/${encodeURIComponent(incidentId)}/routes`,
      {
        params: {
          radius,
          stopRadius,
        },
      },
    )
  ).data;

export const generateDiversion = async (payload) =>
  (await api.post("/diversions/generate", payload)).data;

export const calculateManualDiversionRoute = async (id, points) =>
  (
    await api.post(`/diversions/${encodeURIComponent(id)}/manual-route`, {
      points,
    })
  ).data;

export const acceptManualDiversionRoute = async (
  id,
  points,
  revisionReason = "Controller manually adjusted diversion route.",
  confirmOverride = false,
  overrideReason = "",
) =>
  (
    await api.post(
      `/diversions/${encodeURIComponent(id)}/manual-route/accept`,
      {
        points,
        revisionReason,
        confirmOverride,
        overrideReason,
      },
    )
  ).data;

export const getDiversions = async () => (await api.get("/diversions")).data;

export const getOperations = async () =>
  (await api.get("/diversions/operations/all")).data;

export const setDiversionStatus = async (
  id,
  status,
  controllerName = "Controller",
) =>
  (
    await api.patch(`/diversions/${encodeURIComponent(id)}/status`, {
      status,
      controllerName,
    })
  ).data;

export const acknowledgeDiversion = async (id, driverName = "Driver") =>
  (
    await api.post(`/diversions/${encodeURIComponent(id)}/acknowledge`, {
      driverName,
    })
  ).data;

export const reportDiversionProblem = async (
  id,
  message,
  driverName = "Driver",
) =>
  (
    await api.post(`/diversions/${encodeURIComponent(id)}/report`, {
      message,
      driverName,
    })
  ).data;

export const getCurtailments = async () =>
  (await api.get("/curtailments")).data;

export const getActiveCurtailments = async () =>
  (await api.get("/curtailments/active")).data;

export const getCurtailment = async (id) =>
  (await api.get(`/curtailments/${encodeURIComponent(id)}`)).data;

export const createCurtailment = async (payload) =>
  (await api.post("/curtailments", payload)).data;

export const reviseCurtailment = async (id, payload) =>
  (await api.post(`/curtailments/${encodeURIComponent(id)}/revise`, payload))
    .data;

export const setCurtailmentStatus = async (
  id,
  status,
  controllerName = "Controller",
) =>
  (
    await api.patch(`/curtailments/${encodeURIComponent(id)}/status`, {
      status,
      controllerName,
    })
  ).data;

export const getCurtailmentOperations = async () =>
  (await api.get("/curtailments/operations/all")).data;

export const acknowledgeCurtailment = async (
  id,
  driverName = "Driver",
  vehicleId = "",
) =>
  (
    await api.post(`/curtailments/${encodeURIComponent(id)}/acknowledge`, {
      driverName,
      vehicleId,
    })
  ).data;

export const reportCurtailmentProblem = async (
  id,
  message,
  driverName = "Driver",
  vehicleId = "",
) =>
  (
    await api.post(`/curtailments/${encodeURIComponent(id)}/report`, {
      message,
      driverName,
      vehicleId,
    })
  ).data;

export default api;
