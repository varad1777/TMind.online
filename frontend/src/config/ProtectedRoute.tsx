// src/routes/ProtectedRoute.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ROUTE_PERMISSIONS } from "./routePermissions";
import ForbiddenRedirect from "@/pages/ForbiddenRedirect";

function matchRoute(pathname: string) {
  return Object.keys(ROUTE_PERMISSIONS).find((route) =>
    pathname.startsWith(route.split("/:")[0])
  );
}

export default function ProtectedRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const { user, loading } = useAuth();
  if (loading) return null;
  const location = useLocation();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const matchedRoute = matchRoute(location.pathname);
  const allowedRoles = matchedRoute
    ? ROUTE_PERMISSIONS[matchedRoute]
    : [];

  if (!allowedRoles.includes(user.role)) {
  return <Navigate to="/forbidden" replace />;
  }

  return children;
}
