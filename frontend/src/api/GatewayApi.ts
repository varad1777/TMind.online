import api from "./axios";

/**
 * DTOs matching backend responses
 */

export interface Gateway {
  name: string;
  clientId: string;
}

export interface GatewayCredentialsResponse {
  message: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Fetch all gateways
 * GET /api/Gateway
 */
export const getGateways = async (): Promise<Gateway[]> => {
  const response = await api.get("/Gateway");
  return response.data;
};

/**
 * Add a new gateway
 * POST /api/Gateway/{name}
 */
export const addGateway = async (
  gatewayName: string
): Promise<GatewayCredentialsResponse> => {
  if (!gatewayName || !gatewayName.trim()) {
    throw new Error("Gateway name is required");
  }

  const response = await api.post(
    `/Gateway/${encodeURIComponent(gatewayName.trim())}`
  );

  return response.data;
};

/**
 * Frontend-only search helper
 * (filters already-fetched gateways)
 */
export const searchGateways = (
  gateways: Gateway[],
  searchTerm: string
): Gateway[] => {
  if (!searchTerm) return gateways;

  const term = searchTerm.toLowerCase();

  return gateways.filter(
    (g) =>
      g.name.toLowerCase().includes(term) ||
      g.clientId.toLowerCase().includes(term)
  );
};
