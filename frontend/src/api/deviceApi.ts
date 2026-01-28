import api from "./axios";

/* ============================
   INTERFACES
============================ */

export interface DevicePort {
  slaveIndex: number;
  registerAddress: number;
  registerLength?: number;
  dataType: string;
  scale?: number;
  unit?: string;
  isHealthy?: boolean;
}

export interface DeviceConfiguration {
  name: string;
  pollIntervalMs: number;
  protocolSettingsJson: string;
}

export interface CreateDevicePayload {
  name: string;
  description?: string;
  gatewayClientId: string;
  ports?: DevicePort[];
  configuration?: DeviceConfiguration;
}

export interface Device {
  id: string;
  name: string;
  description?: string;
  gatewayClientId: string;
  ports?: DevicePort[];
  configuration?: DeviceConfiguration;
}

/* ============================
   API FUNCTIONS
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
  return response.data.data;
};

// POST /api/devices
export const createDevice = async (payload: CreateDevicePayload) => {
  const response = await api.post("/devices", payload);
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

  console.log("Update Device Payload:", payload);

  const response = await api.put(`/devices/${id}`, payload.device);
  return response.data.data;
};


// POST /api/devices/{id}/configuration
export const addDeviceConfiguration = async (
  deviceId: string,
  configuration: DeviceConfiguration
) => {
  const response = await api.post(`/devices/${deviceId}/configuration`, configuration);
  // Returns { deviceId: string, configurationId: string }
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

// POST /api/devices/match-by-address
export const matchByRegisterAddress = async (registerAddresses: number[]) => {
  try {
    const response = await api.post("/devices/match-by-address", {
      RegisterAddresses: registerAddresses
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

// GET /stats/avg-response-time
export const getAvgApiResponseTime = async () => {
  const response = await api.get("/stats/avg-response-time");
  return response.data.avgResponseTime;
};