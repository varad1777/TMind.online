
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";
import { Calendar as CalendarIcon, FileText, Download, RefreshCw } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { getAssetHierarchy, getAssetConfig, getSignalOnAsset } from "@/api/assetApi";
import { getDeviceById } from "@/api/deviceApi";
import type { Asset } from "@/api/assetApi";

// API Base URL - adjust this to your backend URL
const API_BASE_URL = "/asset"

export default function Reports() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allAssets, setAllAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [allSignalsOnAsset, setSignalOnAsset] = useState([]);
  const [selectedSignalIds, setSelectedSignalIds] = useState([]);
  const [assetDropdownOpen, setAssetDropdownOpen] = useState(false);
  const [signalDropdownOpen, setSignalDropdownOpen] = useState(false);
  const [assignedDeviceName, setAssignedDeviceName] = useState("None");
  const [reportFormat, setReportFormat] = useState("excel");
  const [requestedReports, setRequestedReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const dropdownRef = useRef(null);
  const signalDropdownRef = useRef(null);

  // Load all assets on mount
  useEffect(() => {
    const loadAssets = async () => {
      try {
        const hierarchy = await getAssetHierarchy();
        const flatten = (nodes) => {
          const out = [];
          const stack = [...nodes];
          while (stack.length > 0) {
            const a = stack.shift();
            out.push(a);
            if (a.childrens?.length) stack.unshift(...a.childrens);
          }
          return out;
        };
        setAllAssets(flatten(hierarchy));
      } catch (err) {
        console.error(err);
        toast.error("Failed to load assets");
      }
    };
    loadAssets();
  }, []);

  // Load requested reports on mount
  useEffect(() => {
    fetchRequestedReports();
  }, []);

  // Get signals for selected asset
  const getSignalsOnAsset = async (selectedID) => {
    try {
      if (selectedID != null) {
        const response = await getAssetConfig(selectedID);
        setSignalOnAsset(response);
      }
    } catch (error) {
      console.log(error);
      toast.error("Failed to load signals");
    }
  };

  // Resolve assigned device for asset
  const resolveAssignedDevice = async (assetId) => {
    try {
      const mappings = await getSignalOnAsset(assetId);
      if (!mappings || mappings.length === 0) {
        setAssignedDeviceName("None");
        return;
      }
      const deviceId = mappings[0].deviceId;
      const device = await getDeviceById(deviceId);
      setAssignedDeviceName(device?.name || "None");
    } catch (err) {
      console.error("Failed to resolve device", err);
      setAssignedDeviceName("None");
    }
  };

  // Fetch all requested reports
  const fetchRequestedReports = async () => {
    setIsLoadingReports(true);
    try {
      const response = await fetch(`${API_BASE_URL}/Reports`);
      if (!response.ok) throw new Error("Failed to fetch reports");
      const data = await response.json();
      setRequestedReports(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load report history");
    } finally {
      setIsLoadingReports(false);
    }
  };

  // Request a new report generation
  const requestReport = async () => {
    // Validation
    if (!selectedAssetId) {
      toast.error("Please select an asset");
      return;
    }
    if (selectedSignalIds.length === 0) {
      toast.error("Please select at least one signal");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end < start) {
      toast.error("End date cannot be earlier than start date");
      return;
    }

    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (daysDiff > 31) {
      toast.error("Date range cannot exceed 31 days");
      return;
    }

    try {
      const requestBody = {
        assetID: selectedAssetId,
        signalIDs: selectedSignalIds,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        reportFormat: reportFormat
      };

      const response = await fetch(`${API_BASE_URL}/Reports/ReportRequest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to request report");
      }

      toast.success("Report requested successfully! Processing...");
      
      // Refresh the reports list after a short delay
      setTimeout(() => {
        fetchRequestedReports();
      }, 2000);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to request report");
    }
  };

  // Download a specific report
  const downloadReport = async (reportId, fileName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/Reports/download/${reportId}`);
      if (!response.ok) throw new Error("Failed to download report");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Report downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to download report");
    }
  };

  // Toggle signal selection
  const toggleSignalSelection = (signalId) => {
    setSelectedSignalIds((prev) => {
      if (prev.includes(signalId)) {
        return prev.filter((id) => id !== signalId);
      } else {
        return [...prev, signalId];
      }
    });
  };

  // Clear asset selection
  const clearAssetSelection = () => {
    setSelectedAssetId("");
    setSelectedSignalIds([]);
    setSignalOnAsset([]);
    setAssignedDeviceName("None");
    setAssetDropdownOpen(false);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAssetDropdownOpen(false);
      }
      if (signalDropdownRef.current && !signalDropdownRef.current.contains(e.target)) {
        setSignalDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getStatusBadge = (status) => {
    const statusColors = {
      Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      Processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      Completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      Failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
    return statusColors[status] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Signal Report Generator</h1>
      </div>

      {/* FILTER CARD */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <h2 className="text-xl font-semibold mb-4">Generate New Report</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* START DATE */}
          <div>
            <label className="block text-sm font-medium mb-2">Start Date</label>
            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(new Date(startDate), "PPP") : "Choose start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md">
                <Calendar
                  mode="single"
                  selected={startDate ? new Date(startDate) : undefined}
                  onSelect={(d) => {
                    if (!d) return;
                    setStartDate(format(d, "yyyy-MM-dd"));
                    setEndDate(null);
                    setStartDateOpen(false);
                  }}
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* END DATE */}
          <div>
            <label className="block text-sm font-medium mb-2">End Date</label>
            <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(new Date(endDate), "PPP") : "Choose end date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md">
                <Calendar
                  mode="single"
                  selected={endDate ? new Date(endDate) : undefined}
                  onSelect={(d) => {
                    if (!d) return;
                    setEndDate(format(d, "yyyy-MM-dd"));
                    setEndDateOpen(false);
                  }}
                  disabled={(d) =>
                  d.getTime() > Date.now() ||
                  (startDate && d.getTime() < new Date(startDate).getTime() - 86400000)
                }

                />
              </PopoverContent>
            </Popover>
          </div>

          {/* ASSET DROPDOWN */}
          <div ref={dropdownRef}>
            <label className="block text-sm font-medium mb-2">Asset *</label>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setAssetDropdownOpen(!assetDropdownOpen)}
            >
              {selectedAssetId
                ? allAssets.find((a) => a.assetId === selectedAssetId)?.name
                : "Select asset"}
            </Button>
            {assetDropdownOpen && (
              <div className="absolute z-50 mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-60 overflow-y-auto w-72">
                <div
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={clearAssetSelection}
                >
                  None
                </div>
                {allAssets.map((a) => (
                  <div
                    key={a.assetId}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                      setSelectedAssetId(a.assetId);
                      getSignalsOnAsset(a.assetId);
                      resolveAssignedDevice(a.assetId);
                      setAssetDropdownOpen(false);
                      setSelectedSignalIds([]);
                    }}
                  >
                    {a.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SIGNALS MULTI-SELECT */}
          <div ref={signalDropdownRef}>
            <label className="block text-sm font-medium mb-2">
              Signals * ({selectedSignalIds.length} selected)
            </label>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setSignalDropdownOpen(!signalDropdownOpen)}
              disabled={!selectedAssetId}
            >
              {selectedSignalIds.length === 0
                ? "Select signals"
                : `${selectedSignalIds.length} signal(s) selected`}
            </Button>
            {signalDropdownOpen && (
              <div className="absolute z-50 mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-60 overflow-y-auto w-72">
                {allSignalsOnAsset.map((s) => (
                  <div
                    key={s.signalTypeID}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-2"
                    onClick={() => toggleSignalSelection(s.signalTypeID)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSignalIds.includes(s.signalTypeID)}
                      onChange={() => {}}
                      className="w-4 h-4"
                    />
                    <span>{s.signalName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DEVICE INFO */}
          <div>
            <label className="block text-sm font-medium mb-2">Assigned Device</label>
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded border">
              {assignedDeviceName}
            </div>
          </div>

          {/* REPORT FORMAT */}
          <div>
            <label className="block text-sm font-medium mb-2">Report Format</label>
            <select
              value={reportFormat}
              onChange={(e) => setReportFormat(e.target.value)}
              className="w-full p-2 border rounded-md dark:bg-gray-700"
            >
              <option value="excel">Excel/CSV</option>
             
            </select>
          </div>
        </div>

        {/* GENERATE BUTTON */}
        <div className="flex justify-end">
          <Button onClick={requestReport} className="bg-blue-600 hover:bg-blue-700">
            <FileText className="mr-2 h-4 w-4" />
            Request Report
          </Button>
        </div>
      </div>

      {/* REQUESTED REPORTS TABLE */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Requested Reports</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRequestedReports}
            disabled={isLoadingReports}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingReports ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="overflow-x-auto">
          {requestedReports.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No reports requested yet. Generate your first report above.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    File Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Asset
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Requested At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {requestedReports.map((report) => (
                  <tr key={report.reportId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 text-sm">{report.fileName}</td>
                    <td className="px-6 py-4 text-sm">{report.assetName}</td>
                    <td className="px-6 py-4 text-sm">
                      {new Date(report.requestedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(report.status)}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {report.status === "Completed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadReport(report.reportId, report.fileName)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      ) : (
                        <span className="text-gray-400 text-xs">Processing...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}