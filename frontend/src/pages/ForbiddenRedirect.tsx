import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ForbiddenRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 2000); // 2 seconds delay

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex h-screen flex-col items-center justify-center text-center px-4">
      <h1 className="text-6xl font-bold text-gray-800">403</h1>
      <p className="mt-4 text-xl text-gray-600">
        You are not allowed to access this page.
      </p>
      <p className="mt-1 text-sm text-gray-500">
        Redirecting you to the dashboard...
      </p>
    </div>
  );
}
