import api from "./axios";

/* ============================
   DTO INTERFACES (BACKEND-ALIGNED)
============================ */

// Matches DeviceSlaveDto
export interface DevicePort {
  slaveIndex: number;
  registerAddress: number;
  registerLength?: number;
  dataType: string;
  scale?: number;
  unit?: string;
  isHealthy?: boolean;
}

// Matches DeviceConfigurationDto
export interface DeviceConfiguration {
  name: string;
  pollIntervalMs: number;
  protocolSettingsJson: string;
}

// Matches CreateDeviceDto
export interface CreateDevicePayload {
  name: string;
  description?: string;
  gatewayClientId: string;
  ports?: DevicePort[];
  configuration?: DeviceConfiguration;
}

// Device read model (GET APIs)
export interface Device {
  id: string;
  name: string;
  description?: string;
  gatewayClientId: string;
  ports?: DevicePort[];
  configuration?: DeviceConfiguration;
}

/* ============================
   API METHODS
============================ */

// GET /api/devices
export const getDevices = async (
  pageNumber = 1,
  pageSize = 10,
  searchTerm = ""
) => {
  const response = await api.get("/devices", {
    params: { pageNumber, pageSize, searchTerm },
  });

  // returns: items, pageNumber, pageSize, totalCount, totalPages
  return response.data.data;
};

// POST /api/devices
export const createDevice = async (payload: CreateDevicePayload) => {
  const response = await api.post("/devices", payload);

  // returns: { deviceId }
  return response.data.data;
};

// GET /api/devices/{id}
export const getDeviceById = async (id: string) => {
  const response = await api.get(`/devices/${id}`);
  return response.data.data;
};

// PUT /api/devices/{id}
export const updateDevice = async (
  id: string,
  device: Partial<CreateDevicePayload>,
  configuration?: DeviceConfiguration
) => {
  const payload = {
    device,
    configuration: configuration ?? null,
  };

  const response = await api.put(`/devices/${id}`, payload);
  return response.data.data;
};

// DELETE /api/devices/{id} (soft delete)
export const deleteDevice = async (id: string) => {
  const response = await api.delete(`/devices/${id}`);
  return response.data.data;
};

// POST /api/devices/{id}/restore
export const restoreDeviceById = async (id: string) => {
  const response = await api.post(`/devices/${id}/restore`);
  return response.data.data;
};

// GET /api/devices/deleted
export const getDeletedDevices = async () => {
  const response = await api.get("/devices/deleted");
  return response.data.data;
};

export const matchByRegisterAddress = async (registerAddresses: number[]) => {
  try {
    const response = await api.post("/devices/match-by-address", {
      RegisterAddresses: registerAddresses  // ✅ Capital R
    });
    
    console.log('API Response:', response.data);
    
    return {
      success: true,
      data: response.data.data || []
    };
  } catch (error: any) {
    console.error('Match API Error:', error.response?.data || error);
    return {
      success: false,
      data: [],
      error: error
    };
  }
};

// (unchanged – system stats)
export const getAvgApiResponseTime = async () => {
  const response = await api.get("/stats/avg-response-time");
  return response.data.avgResponseTime;
};
