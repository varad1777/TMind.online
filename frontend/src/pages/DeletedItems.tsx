import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Search } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";

// APIs
import { getDeletedAssets, restoreAssetById } from "@/api/assetApi";
import { getDeletedDevices, restoreDeviceById } from "@/api/deviceApi";

// ----------------------
// Interfaces
// ----------------------
interface Asset {
  id: string;
  name: string;
  isDeleted: boolean;
}

interface Device {
  deviceId: string;
  name: string;
  protocol: string;
}

// -------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------
export default function DeletedItems() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  // ASSET STATES
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  // DEVICE STATES
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // -------------------------------------------------
  // FETCH DELETED ASSETS
  // -------------------------------------------------
useEffect(() => {
  const fetchAssets = async () => {
    try {
      setLoadingAssets(true);
      const data = await getDeletedAssets();

      // Map API Asset[] to your local Asset[] type
      const assetsWithId = data.map(a => ({
        ...a,
        id: a.id || a.assetId || "" // <-- assign id from API field or empty
      }));

      setAssets(assetsWithId);
    } catch (err) {
      setAssetError("Failed to fetch deleted assets.");
      toast.error("Failed to load deleted assets.");
    } finally {
      setLoadingAssets(false);
    }
  };
  fetchAssets();
}, []);


  const restoreAsset = async (assetId: string) => {
    try {
      await restoreAssetById(assetId);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      toast.success("Asset restored successfully!", { autoClose: 2000 });
    } catch (err) {
      toast.error("Failed to restore asset.", { autoClose: 2000 });
    }
  };

  const filteredAssets = assets.filter((a) =>
    a.name.toLowerCase().includes(assetSearch.toLowerCase())
  );

  // -------------------------------------------------
  // FETCH DELETED DEVICES
  // -------------------------------------------------
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoadingDevices(true);
        const data = await getDeletedDevices();
        setDevices(data);
      } catch (err) {
        setDeviceError("Failed to fetch deleted devices.");
        toast.error("Failed to load deleted devices.");
      } finally {
        setLoadingDevices(false);
      }
    };
    fetchDevices();
  }, []);

  const retrieveDevice = async (deviceId: string) => {
    try {
      await restoreDeviceById(deviceId);
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      toast.success("Device retrieved successfully!", { autoClose: 2000 });
    } catch (err) {
      toast.error("Failed to retrieve device.", { autoClose: 2000 });
    }
  };

  const filteredDevices = devices.filter((d) =>
    d.name.toLowerCase().includes(deviceSearch.toLowerCase())
  );

  return (
    <div className="p-2 space-y-2">
      {/* SIDE-BY-SIDE CARDS */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Recently Deleted</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* -------------------------------- */}
        {/* LEFT CARD — Deleted Devices     */}
        {/* -------------------------------- */}
        <div className="rounded-lg border border-border bg-card p-4 shadow flex flex-col">
          <h1 className="text-2xl font-semibold mb-1">Deleted Devices</h1>
          <p className="text-muted-foreground mb-4">Manage all deleted devices</p>

          {/* Search */}
          <div className="relative w-full mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              id="deleted-item-device"  
              type="text"
              placeholder="Search devices..."
              value={deviceSearch}
              onChange={(e) => setDeviceSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-background text-foreground"
            />
          </div>

          {/* Loading / Error */}
          {loadingDevices && <div className="text-muted-foreground">Loading devices...</div>}
          {deviceError && <div className="text-destructive">{deviceError}</div>}

          {/* Device Table */}
          {!loadingDevices && !deviceError && (
            <table id="deleted-device-table" className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-semibold">Device Name</th>
                  {isAdmin && <th className="p-3 font-semibold text-center">Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filteredDevices.length > 0 ? (
                  filteredDevices.map((d) => (
                    <tr key={d.deviceId} className="border-t hover:bg-muted/20">
                      <td className="p-3">{d.name}</td>

                      {isAdmin && (
                        <td className="p-3 flex justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => retrieveDevice(d.deviceId)}
                            className="retrieve-device-btn flex items-center gap-1"
                          >
                            <RotateCcw className="h-4 w-4" /> Retrieve
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={2}>
                      No deleted devices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* -------------------------------- */}
        {/* RIGHT CARD — Deleted Assets     */}
        {/* -------------------------------- */}
        <div className="rounded-lg border border-border bg-card p-4 shadow flex flex-col">
          <h1 className="text-2xl font-semibold mb-1">Deleted Assets</h1>
          <p className="text-muted-foreground mb-4">Manage all deleted assets</p>

          {/* Search */}
          <div className="relative w-full mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              id="deleted-item-asset"  
              type="text"
              placeholder="Search assets..."
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-background text-foreground"
            />
          </div>

          {/* Loading / Error */}
          {loadingAssets && <div className="text-muted-foreground">Loading assets...</div>}
          {assetError && <div className="text-destructive">{assetError}</div>}

          {/* Assets Table */}
          {!loadingAssets && !assetError && (
            <table id="deleted-asset-table"  className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-semibold">Asset Name</th>
                  {isAdmin && <th className="p-3 font-semibold text-center">Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filteredAssets.length > 0 ? (
                  filteredAssets.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20">
                      <td className="p-3">{a.name}</td>

                      {isAdmin && (
                        <td className="p-3 flex justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => restoreAsset(a.id)}
                            className="restore-asset-btn flex items-center gap-1"
                          >
                            <RotateCcw className="h-4 w-4" /> Restore
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={2}>
                      No deleted assets found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
