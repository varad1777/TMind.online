import axios from "axios";

const baseURL = `${import.meta.env.VITE_API_URL}/api/devices`;

const api = axios.create({
  baseURL: baseURL,  
  withCredentials: true, 
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        console.log("🔄 Attempting token refresh...");
        console.log("🍪 Current cookies:", document.cookie); // Check what cookies exist
        
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/User/refresh-token`,
          {},
          { withCredentials: true }
        );
        
        console.log("✅ Refresh successful:", response.data);
        return api(originalRequest);
      } catch (err:any) {
        console.log("❌ Refresh token failed:", err.response?.data);
        localStorage.removeItem("user");
          window.location.href = "/";
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default api;