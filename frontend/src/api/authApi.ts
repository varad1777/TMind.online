import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/auth`,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/User/refresh-token`,
          {},
          { withCredentials: true }
          );

        return api(originalRequest);
      } catch (err) {
        console.log("Refresh token failed, redirecting to login");
        localStorage.removeItem("user");
        await api.post("/User/Logout");
        window.location.href = "/";
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
