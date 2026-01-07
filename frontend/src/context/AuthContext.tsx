import React, { createContext, useContext, useEffect, useState } from "react";
import authApi from "@/api/authApi";
import { getCurrentUser,markTourCompleted } from "@/api/userApi";
import { clearTourData } from "@/hooks/tourStorage";

interface User {
  username: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Load user if already logged
//   useEffect(() => {
//   const storedUser = localStorage.getItem("user");
//   if (storedUser) {
//     setUser(JSON.parse(storedUser));
//   }
//   setLoading(false);
// }, []);
useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        const { userId, ...safeUser } = currentUser;
        setUser(safeUser);
      } catch (err: any) {
        // IMPORTANT: only clear user, do NOT retry
        setUser(null);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    // 🔑 Only try once
    if (!initialized) {
      loadUser();
    }
  }, [initialized]);




  // const login = async (email: string, password: string) => {
  //   await authApi.post("/User/Login", { email, password });
  //   const currentUser = await getCurrentUser();
  //   const { userId, ...userWithoutId } = currentUser;
  //   setUser(userWithoutId);

  // localStorage.setItem("user", JSON.stringify(userWithoutId));
  // };

  const login = async (email: string, password: string) => {
  await authApi.post("/User/Login", { email, password });

  const currentUser = await getCurrentUser();
  const { userId, ...safeUser } = currentUser;
  setUser(safeUser);
  setLoading(false);
};


 
  const verifyOtp = async (email: string, otp: string) => {
    const response = await authApi.post("/User/OtpVerify", { email, otp });

    // const currentUser = await getCurrentUser();
    // setUser(currentUser);
    // localStorage.setItem("user", JSON.stringify(currentUser));
  };

 
  const signup = async (username: string, email: string, password: string) => {
    await authApi.post("/User/Register", { username, email, password });
  };


  const logout = async () => {
    try {
      clearTourData();
      await markTourCompleted();
      await authApi.post("/User/Logout");
    } catch (err) {
      console.warn("Logout API failed:", err);
    } finally {
      // localStorage.removeItem("user");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, verifyOtp, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};