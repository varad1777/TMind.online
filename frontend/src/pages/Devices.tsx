import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Trash2,
  Wrench,
  Search,
  HdmiPort,
  AlertTriangle,
  View
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDevices, deleteDevice } from "@/api/deviceApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "react-toastify";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useAuth } from "@/context/AuthContext"; 
import { Spinner } from "@/components/ui/spinner";

interface Device {
  deviceId: string;
  name: string;
  description: string;
  protocol: string;
  deviceConfiguration?: {
    configurationId: string;
    name: string;
    pollIntervalMs: number;
    protocolSettingsJson: string;
  };
}

type SelectedDevice = { deviceId: string; name: string };

const SESSION_KEY = "selectedDeviceIds";

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize] = useState(6);
  const [totalPages, setTotalPages] = useState(1);

  const navigate = useNavigate();
  const { user } = useAuth(); 


  function readSelectedDevices(): SelectedDevice[] {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x) => {
          if (x && typeof x === "object") {
            const id = String((x as any).deviceId ?? (x as any).id ?? "");
            const name = String((x as any).name ?? (x as any).displayName ?? "");
            if (id) return { deviceId: id, name };
          }
          return null;
        })
        .filter((x): x is SelectedDevice => x !== null);
    } catch {
      return [];
    }
  }

  const [sessionSelectedDevices, setSessionSelectedDevices] = useState<SelectedDevice[]>(
    () => readSelectedDevices()
  );

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SESSION_KEY) {
        setSessionSelectedDevices(readSelectedDevices());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true);
        const data = await getDevices(pageNumber, pageSize, debouncedSearch);
        // console.log("Fetched devices:", data);
        setDevices(data.items);
        setTotalPages(data.totalPages);
      } catch (err: any) {
        console.error("Error fetching devices:", err);
        setError("Failed to fetch devices.");
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, [pageNumber, pageSize, debouncedSearch]);

  const handleDelete = async () => {
    if (!selectedDevice) return;
    try {
      await deleteDevice(selectedDevice.deviceId);
      setDevices((prev) =>
        prev.filter((d) => d.deviceId !== selectedDevice.deviceId)
      );
      toast.success(`Device "${selectedDevice.name}" deleted successfully!`);
    } catch (err:any) {
      console.error("Error deleting device:", err);
      toast.error( err?.response?.data?.error || "Failed to delete device. Please try again.");
    } finally {
      setOpenDialog(false);
      setSelectedDevice(null);
    }
  };

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);

  const toggleSelectedDevice = useCallback((name: string, deviceId: string) => {
    let current = readSelectedDevices();
    const exists = current.some((sd) => sd.deviceId === deviceId);
    if (exists) {
      current = current.filter((sd) => sd.deviceId !== deviceId);
    } else {
      current = [...current, { deviceId, name }];
    }
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn("Failed to write sessionStorage", e);
    }
    setSessionSelectedDevices(current);
    return !exists;
  }, []);

  function isDeviceSelected(deviceId: string) {
    return sessionSelectedDevices.some((sd) => sd.deviceId === deviceId);
  }

  // Check user is Admin
  const isAdmin = user?.role === "Admin";

  return (
    <div className="p-2 space-y-2">
   
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Devices</h1>
          <p className="text-muted-foreground">Manage all connected devices</p>
        </div>

        
      </div>

      {/* Search */}
      <div className="flex items-center sm:justify-between gap-3">
        <div className="relative w-full sm:w-1/3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search devices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
          <div className="flex flex-row gap-2">
            <Button id="add-device-btn"
              onClick={() => navigate("/devices/add")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              + Add Device
            </Button>

          {isAdmin && (
            <Button id="import-bulk-btn"
              onClick={() => navigate("/devices/upload")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              + Import Bulk
            </Button>
          )}
          </div>
        </div>

      {loading && <div className="w-full h-full flex justify-center items-center">
      <Spinner /></div>}
      {error && <div className="text-center text-destructive">{error}</div>}

      {!loading && !error && (
        <div id="device-list" className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm text-foreground">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-4 font-semibold">Device Name</th>
                <th className="p-4 font-semibold">Description</th>
                <th className="p-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const isSelected = isDeviceSelected(d.deviceId);
                return (
                  <tr key={d.deviceId} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="p-4 font-medium">{d.name}</td>
                    <td className="p-4">{d.description}</td>
                    <td className="p-4 flex justify-center">
                      <div className="grid grid-cols-2 md:flex md:flex-row gap-2 w-full justify-center">
                          <Button
                              variant="outline"
                              size="sm"
                              title="Edit"
                              onClick={() => navigate(`/devices/edit/${d.deviceId}`)}
                              className="flex items-center gap-1 edit-device-btn"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="hidden md:inline">Edit</span>
                            </Button>


                          {!d.deviceConfiguration && (
                            <Button
                            variant="outline"
                            size="sm"
                            title="Config"
                            onClick={() => navigate(`/devices/config/${d.deviceId}`)}
                            className="flex items-center gap-1 config-device-btn"
                          >
                            <Wrench className="h-4 w-4" />
                            <span className="hidden md:inline">Config</span>
                          </Button>
                          )}
                       {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="Delete"
                          onClick={() => {
                            setSelectedDevice(d);
                            setOpenDialog(true);
                          }}
                          className="flex items-center gap-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden md:inline delete-device-btn">Delete</span>
                        </Button>
                      )}
                             
                     <Button
                        variant="outline"
                        size="sm"
                        title="Slave"
                        onClick={() => navigate(`/devices/ports/${d.deviceId}`)}
                        className="flex items-center gap-1"
                      >
                        <HdmiPort className="h-4 w-4" />
                        <span className="hidden md:inline slave-device-btn">Slave</span>
                      </Button>

                      {d.deviceConfiguration && (
                        <Button
                          variant={isSelected ? "destructive" : "outline"}
                          size="sm"
                          title={isSelected ? "Unsubscribe" : "Subscribe"}
                          onClick={() => toggleSelectedDevice(d.name, d.deviceId)}
                          className="flex items-center gap-1"
                        >
                          <View className="h-4 w-4" />
                          <span className="hidden md:inline">
                            {isSelected ? "Unsubscribe" : "Subscribe"}
                          </span>
                        </Button>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {devices.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center p-6 text-muted-foreground">
                    No devices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <Pagination className="justify-center mt-6">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPageNumber((prev) => Math.max(prev - 1, 1));
                }}
              />
            </PaginationItem>

            {pageNumbers.map((num) => (
              <PaginationItem key={num}>
                <PaginationLink
                  href="#"
                  isActive={num === pageNumber}
                  onClick={(e) => {
                    e.preventDefault();
                    setPageNumber(num);
                  }}
                >
                  {num}
                </PaginationLink>
              </PaginationItem>
            ))}

            {totalPages > 5 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPageNumber((prev) => Math.min(prev + 1, totalPages));
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md border border-border shadow-2xl rounded-2xl p-6 bg-card animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col items-center justify-center text-center mx-auto">
          <div className="flex flex-col items-center text-center space-y-4 w-full ">
            <div className="bg-red-100 dark:bg-red-900/40 p-3 rounded-full">
              <AlertTriangle className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-red-600 dark:text-red-400">
                Confirm Deletion
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                "{selectedDevice?.name}"
              </span>
              ?
            </p>
            <DialogFooter className="flex w-full gap-2 pt-3 sm:pt-4">
              <Button
                variant="outline"
                onClick={() => setOpenDialog(false)}
                className="
                  flex-1
                  h-9 sm:h-10
                  text-xs sm:text-sm
                  hover:bg-muted
                "
              >
                No, Keep it
              </Button>

              <Button
                variant="destructive"
                onClick={handleDelete}
                className="
                  flex-1
                  h-9 sm:h-10
                  text-xs sm:text-sm
                  flex items-center justify-center gap-1 sm:gap-2
                  bg-red-600 hover:bg-red-700 text-white
                  shadow-md transition-all
                "
              >
                <Trash2 className="h-4 w-4" />
                Yes, Delete it
              </Button>
            </DialogFooter>

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
