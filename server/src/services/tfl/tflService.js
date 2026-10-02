import axios from "axios";

const TFL_BASE_URL = "https://api.tfl.gov.uk";

const tflApi = axios.create({
  baseURL: TFL_BASE_URL,
  timeout: 15000,
});

export async function getRoadDisruptions() {
  const response = await tflApi.get("/Road/all/Disruption");
  return response.data;
}

export async function getBusLines() {
  const response = await tflApi.get("/Line/Mode/bus");
  return response.data;
}

export async function getLineStatus(lineId) {
  const response = await tflApi.get(`/Line/${lineId}/Status`);
  return response.data;
}

export async function getLineRoute(lineId) {
  const response = await tflApi.get(`/Line/${lineId}/Route/Sequence/all`);
  return response.data;
}

export async function getLineArrivals(lineId) {
  const response = await tflApi.get(`/Line/${lineId}/Arrivals`);
  return response.data;
}

export async function getLineRouteSequence(lineId) {
  const response = await tflApi.get(
    `/Line/${lineId}/Route/Sequence/all`
  );
  return response.data;
}

export async function getLineRouteGeometry(
  lineId,
  direction = "outbound"
) {
  const response = await tflApi.get(
    `/Line/${lineId}/Route/Sequence/${direction}`
  );
  return response.data;
}

export async function getBusStopsNearPoint(
  latitude,
  longitude,
  radius = 500
) {
  const response = await tflApi.get("/StopPoint", {
    params: {
      lat: latitude,
      lon: longitude,
      stopTypes: "NaptanPublicBusCoachTram",
      radius,
      useStopPointHierarchy: false,
      returnLines: true,
    },
  });

  return response.data?.stopPoints || [];
}