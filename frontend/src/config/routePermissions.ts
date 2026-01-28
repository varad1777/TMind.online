// src/config/routePermissions.ts

export type UserRole = "Admin" | "Engineer" | "Operator" | "User";

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard": ["Admin", "Engineer", "Operator", "User"],

  "/assets": ["Admin", "Engineer", "Operator"],
  "/devices": ["Admin", "Engineer"],
  "/devices/add": ["Admin", "Engineer"],
  "/devices/edit/:deviceId": ["Admin", "Engineer"],
  "/devices/config/:deviceId": ["Admin", "Engineer"],
  "/devices/ports/:id": ["Admin", "Engineer"],
  "/devices/upload": ["Admin"],
  "/gateways": ["Admin", "Engineer", "Operator"],

  "/signal": ["Admin", "Engineer", "Operator"],

  "/notifications": ["Admin", "Engineer", "Operator"],
  "/reports": ["Admin", "Engineer", "Operator", "User"],

  "/manage-user": ["Admin"],
  "/deleted-items": ["Admin"],

  "/settings": ["Admin", "Engineer", "Operator", "User"],
  "/profile": ["Admin", "Engineer", "Operator", "User"],
  "/ai": ["Admin", "Engineer"],

  "/map-device-to-asset/:assetid": ["Admin", "Engineer"],
  "/Asset/BulkUpload": ["Admin", "Engineer"],
  "/Asset/Alerts/:assetId": ["Admin", "Engineer", "Operator"],
  "/forbidden": ["Admin", "Engineer", "Operator", "User"],
};
