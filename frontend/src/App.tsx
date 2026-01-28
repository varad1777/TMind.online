// App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import Devices from "./pages/Devices";
import AddDeviceForm from "./devices/AddDevice";
import EditDeviceForm from "./devices/EditDevice";
import ConfigureDeviceForm from "./devices/ConfigureDevice";
import UploadCsvModal from "./devices/UploadDeviceCsv";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import DeletedItems from "./pages/DeletedItems";
import Profile from "./pages/Profile";
import ManageUser from "./pages/ManageUser";
import Signal from "./pages/Signal";
import AddPortForm from "./devices/AddPortsForm";
import { TooltipProvider } from "@/components/ui/tooltip";
import Map_Device_To_Asset from "./asset/Map-Device-To-Asset";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useEffect, useState } from "react";
import PageLoader from "./components/Loader";
import { NotificationProvider } from "./context/NotificationContext";
import AiRcaChat from "./pages/Ai";
import AssetBulkUpload from "./asset/UploadAssetCsv";
import Notifications from "./pages/Notifications";
import AlertsPage from "./pages/Alerts";
import ProtectedRoute from "./config/ProtectedRoute";
import NotFound from "./pages/NotFound";
import ForbiddenRedirect from "./pages/ForbiddenRedirect";
import Gateways from "./pages/Gateways";

export default function App() {
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const handleLoad = () => {
      setTimeout(() => setShowLoader(false), 800);
    };

    // If the load event already fired before effect mounted, hide loader immediately
    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
      return () => window.removeEventListener("load", handleLoad);
    }
  }, []);

  return (
    <TooltipProvider>
      
        <ToastContainer position="top-right" autoClose={2000} theme="light" />
        {/* <PageLoader isVisible={showLoader} /> <- mounted at app root so it shows on any full-page load */}
        <Router>
          <PageLoader isVisible={showLoader} />
          <Routes>
            <Route path="/" element={<Login />} />

            <Route element={
          <NotificationProvider>
             <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          </NotificationProvider>
          }>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/add" element={<AddDeviceForm />} />
              <Route path="/devices/edit/:deviceId" element={<EditDeviceForm />} />
              <Route path="/devices/config/:deviceId" element={<ConfigureDeviceForm />} />
              <Route path="/devices/ports/:id" element={<AddPortForm />} />
              <Route path="/devices/upload" element={<UploadCsvModal />} />
              <Route path="/signal" element={<Signal />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/manage-user" element={<ManageUser />} />
              <Route path="/deleted-items" element={<DeletedItems />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/ai" element={<AiRcaChat />} />
              <Route path="/map-device-to-asset/:assetid" element={<Map_Device_To_Asset />} />
              <Route path="Asset/BulkUpload" element={<AssetBulkUpload/>} />
              <Route path="Asset/Alerts/:assetId" element={<AlertsPage/>} />
              <Route path="/forbidden" element={<ForbiddenRedirect />} />
              <Route path="/gateways" element={<Gateways />} />

              
            </Route>

            <Route path="*" element={<NotFound />} />

          </Routes>
        </Router>
    </TooltipProvider>
  );
}
