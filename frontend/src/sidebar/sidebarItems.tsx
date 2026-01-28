// src/config/sidebarItems.tsx
import {
  Home,
  Network,
  Cpu,
  File,
  UserRoundSearch,
  Trash,
  Tv,
  Bell,
} from "lucide-react";

export const SIDEBAR_ITEMS = [
  { key: "dashboard", icon: Home, label: "Dashboard", path: "/dashboard" },
  { key: "assets", icon: Network, label: "Assets", path: "/assets" },
  { key: "devices", icon: Cpu, label: "Devices", path: "/devices" },
  { key: "signal", icon: Tv, label: "Signal", path: "/signal" },
  { key: "reports", icon: File, label: "Reports", path: "/reports" },
  { key: "notifications", icon: Bell, label: "Notifications", path: "/notifications" },
  {key: "gateways", icon: Network, label: "Gateways", path: "/gateways"},
  // Admin-only
  { key: "manage-user", icon: UserRoundSearch, label: "Manage User", path: "/manage-user" },
  { key: "deleted-items", icon: Trash, label: "Recently Deleted", path: "/deleted-items" },
];
