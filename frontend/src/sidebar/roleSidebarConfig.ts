export type UserRole = "Admin" | "Engineer" | "Operator" | "User";

export const ROLE_SIDEBAR_ACCESS: Record<UserRole, string[]> = {
  Admin: [
    "dashboard",
    "assets",
    "devices",
    "signal",
    "reports",
    "notifications",
    "manage-user",
    "deleted-items",
    "gateways",
  ],

  Engineer: [
    "dashboard",
    "assets",
    "devices",
    "signal",
    "notifications",
    "reports",
    "gateways",
  ],

  Operator: [
    "dashboard",
    "assets",
    "signal",
    "notifications",
    "reports",
    "gateways",
  ],

  User: [
    "dashboard",
    "reports",
  ],
};
