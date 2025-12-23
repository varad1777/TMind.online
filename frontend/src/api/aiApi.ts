import axios from "axios";

const baseURL = `${import.meta.env.VITE_API_URL}/api/ai`;

const AiApi = axios.create({
  baseURL,
  withCredentials: true,
});

// 🔁 Auto-refresh token interceptor
AiApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
       await axios.post(
          `${baseURL}/auth/User/refresh-token`,  // Through gateway
         {},
        { withCredentials: true }
       );

        return AiApi(originalRequest);
      } catch (err) {
        console.error("Refresh token failed. Redirecting...");
        localStorage.removeItem("user");
        if (window.location.pathname !== "/") {
          window.location.href = "/";
        }
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default AiApi;
