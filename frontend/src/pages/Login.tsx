import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext"; 
import {toast} from "react-toastify";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, signup, user } = useAuth(); // removed verifyOtp (no OTP)

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  // ✅ Validation (OTP removed)
  const validate = () => {
    const newErrors: typeof errors = {};
    if (mode === "signup" && !/^[A-Za-z0-9]{3,}$/.test(username)) {
      newErrors.username = "Username must be at least 3 characters.";
    }
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      newErrors.email = "Invalid email format.";
    }
    if (mode === "signup") {
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(password)) {
        newErrors.password =
          "Password must include uppercase, lowercase, number, and symbol (min 8 chars).";
      }
    } else {
      // For login, ensure password is provided (simple check)
      if (!password) {
        newErrors.password = "Password is required.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 🚀 Handle Login / Signup (no OTP)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      if (mode === "login") {
        // Login using email + password only (no OTP)
        await login(email, password);
        toast.success("Logged in successfully!");
        navigate("/dashboard", { state: { IsLoggedIn: true } });
      } else if (mode === "signup") {
        await signup(username, email, password);
        toast.success("Registered successfully! Please login.");
        setMode("login");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.data?.message ||
        (err?.message ?? "Something went wrong. Please try again.");
      toast.error(msg);
      console.error("Auth Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔐 Redirect if already logged in
  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground transition-colors duration-300">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-[90%] max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 transition-all duration-300"
      >
        <h1 className="text-2xl font-semibold text-center mb-2">
          {mode === "signup" ? "Create Account" : "Welcome Back"}
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-4">
          {mode === "signup"
            ? "Sign up to start managing your devices"
            : "Login to access your WMind dashboard"}
        </p>

        
        {mode === "signup" && (
          <div>
            <label className="block text-sm mb-1 font-medium">Username</label>
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-background text-foreground border border-border rounded-md p-2.5 
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60 
                placeholder:text-muted-foreground shadow-sm transition-all"
            />
            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
          </div>
        )}

        {/* Email + Password */}
        <div>
          <label className="block text-sm mb-1 font-medium">Email</label>
          <input
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-background text-foreground border border-border rounded-md p-2.5 
              focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60 
              placeholder:text-muted-foreground shadow-sm transition-all"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm mb-1 font-medium">Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-background text-foreground border border-border rounded-md p-2.5 
              focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/60 
              placeholder:text-muted-foreground shadow-sm transition-all"
          />
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className={`mt-2 w-full py-2 rounded-md font-medium transition-all ${
            loading
              ? "bg-primary/70 text-primary-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-lg"
          }`}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </div>
          ) : mode === "signup" ? (
            "Create Account"
          ) : (
            "Login"
          )}
        </button>

        {/* Mode Switch */}
        {mode === "login" ? (
          <p className="text-center text-sm mt-3 text-muted-foreground">
            Don’t have an account?{" "}
            <span onClick={() => setMode("signup")} className="text-primary underline cursor-pointer">
              Sign up
            </span>
          </p>
        ) : (
          <p className="text-center text-sm mt-3 text-muted-foreground">
            Already have an account?{" "}
            <span
              onClick={() => {
                setMode("login");
              }}
              className="text-primary underline cursor-pointer"
            >
              Login here
            </span>
          </p>
        )}
      </form>
    </div>
  );
};

export default Login;
