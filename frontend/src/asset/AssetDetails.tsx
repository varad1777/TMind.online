import React, { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, Unplug, Activity, Sparkles, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getMappingById } from "@/api/assetApi";
import { getDeviceById } from "@/api/deviceApi";
import axios from "axios";
import { toast } from "sonner";
import levelToType from "./mapBackendAsset";
import apiAsset from "@/api/axiosAsset";

interface AssetDetailsProps {
  selectedAsset: any | null;
  onAssignDevice: () => void;
  onRestore: () => void;
}

export interface AssetConfig {
  mappingId: string;
  assetId: string;
  signalTypeId: string;
  deviceId: string;
  devicePortId: string;
  signalUnit: string;
  signalName: string;
  registerAdress: number;
  createdAt: Date;
}

export default function AssetDetails({
  selectedAsset,
  onAssignDevice,
  onRestore,
}: AssetDetailsProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const navigate = useNavigate();
  const [assetConfig, setAssetConfig] = useState<AssetConfig[] | null>(null);
  const [deviceDetails, setDeviceDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  let [alerts, setAlerts] = useState<any>("");
  const recommendationRef = useRef<HTMLDivElement | null>(null);

  const [recommendation, setRecommendation] = useState<string>("");
  const [typedText, setTypedText] = useState<string>("");


  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const POLLING_INTERVAL = 5000;

  const fetchSignalsAndDevices = async (assetId: string) => {
    try {
      const data = await getMappingById(assetId); // returns IMapping[]

      // Convert 'createdAt' string → Date
      const mappedData: AssetConfig[] = data.map((d: any) => ({
        ...d,
        createdAt: new Date(d.createdAt),
      }));
      setAssetConfig(mappedData);

      // Fetch unique connected devices
      const uniqueDeviceIds = Array.from(new Set(mappedData.map(d => d.deviceId)));
      const devices = await Promise.all(
        uniqueDeviceIds.map(async (id) => {
          try {
            const res = await getDeviceById(id);
            return res?.name ?? res?.data?.name ?? "Unknown Device";
          } catch {
            return "Unknown Device";
          }
        })
      );
      setDeviceDetails(devices);

    } catch (err) {
      console.error("Error fetching asset mappings:", err);
      setAssetConfig(null);
      setDeviceDetails([]);
    }
  };

  const getAlerts = async (id: any) => {
    try {
      const response = await apiAsset.get(
        `/alerts/asset/${id}/pending`
      );

      const alerts = response?.data ?? [];

      if (Array.isArray(alerts) && alerts.length > 0) {
        setAlerts(alerts);
      } else {
        setAlerts([]);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      setAlerts([]);
    }
  };


  const POLL_INTERVAL_MS = 2000;

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!selectedAsset?.assetId) return;

    const assetId = selectedAsset.assetId;

    // Initial fetch
    getAlerts(assetId);

    // Start polling
    pollingRef.current = setInterval(() => {
      getAlerts(assetId);
    }, POLL_INTERVAL_MS);

    // Cleanup when page unmounts or asset changes
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [selectedAsset?.assetId]);


  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!selectedAsset?.assetId) {
      setAssetConfig(null);
      setDeviceDetails([]);
      setRecommendation("")
      setTypedText("")

      return;
    }

    const initialFetch = async () => {
      getAlerts(selectedAsset.assetId)
      setRecommendation("")
      setTypedText("")
      setLoading(true);
      await fetchSignalsAndDevices(selectedAsset.assetId);
      setLoading(false);
    };

    initialFetch();

    intervalRef.current = setInterval(() => {
      fetchSignalsAndDevices(selectedAsset.assetId);
    }, POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedAsset?.assetId]);

  const handleDetachDevice = async () => {
    if (!selectedAsset?.assetId) return;
    try {
      setDetaching(true);
      await apiAsset.delete(`/Mapping/${selectedAsset.assetId}`);
      toast.success("Device detached successfully!");
      setAssetConfig(null);
      setTypedText("")
      setRecommendation("")
      setDeviceDetails([]);
      await fetchSignalsAndDevices(selectedAsset.assetId);
    } catch (err) {
      console.error("Failed to detach device:", err);
      toast.error("Failed to detach device. Try again.");
    } finally {
      setDetaching(false);
    }
  };

  const isEngineer = user?.role === "Engineer";

  const hasDeviceAssigned = assetConfig && assetConfig.length > 0;
  const canShowDeviceButton = (isAdmin || isEngineer) && [3, 4, 5].includes(selectedAsset?.level);

  const assetType = selectedAsset ? levelToType(selectedAsset.level) : "";
  const subAssetCount = selectedAsset?.childrens?.length || 0;

  const formatLocalTime = (utcString: string) => {
    if (!utcString) return "-";
    return new Date(utcString + "Z").toLocaleString("en-IN");
  };


  const typeWriter = (text: string, speed = 20) => {
    setTypedText("");
    let index = 0;

    const interval = setInterval(() => {
      setTypedText((prev) => prev + text.charAt(index));
      index++;

      if (index >= text.length) {
        clearInterval(interval);
      }
    }, speed);
  };


  const analyseAlert = async (fromTime: any) => {
    if (!selectedAsset || !alerts?.length) return;

    setAiLoading(true);
    setRecommendation("");
    setTypedText("");

    // Ensure DOM renders before scroll
    setTimeout(() => {
      recommendationRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);

    try {
      const res = await apiAsset.post("alerts/analyze-asset", {
        assetId: selectedAsset.assetId,
        fromUtc: fromTime,
        toUtc: new Date().toISOString(),
      });

      if (res.data.success) {
        const parsed = JSON.parse(res.data.recommendation);
        const rcaText = parsed?.rca ?? "";

        setRecommendation(rcaText);
        setAiLoading(false);

        // Start typing AFTER loading ends
        typeWriter(rcaText);
      }
    } catch (err) {
      setAiLoading(false);
    }
  };

  const AlertsSection = () => (
  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
    <div className="flex justify-between items-center border-b-2 pb-2">
      <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
        <AlertCircle className="h-4 w-4" /> Alerts
      </h3>
      <Button
        className="text-sm"
        onClick={() => navigate(`/Asset/Alerts/${selectedAsset?.assetId}`)}
      >
        show Previous Alerts
      </Button>
    </div>

    <div className="space-y-3">
      {alerts?.length ? (
        alerts.map(alert => (
          <div
            key={alert.alertId}
            className="bg-white dark:bg-slate-700 rounded-lg border-l-4 border-orange-400 p-4"
          >
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                              <strong className="text-slate-900 dark:text-slate-100">{alert.signalName}</strong> spiked from <strong>{formatLocalTime(alert.alertStartUtc)}</strong> to <strong>{formatLocalTime(alert.alertEndUtc)}</strong>.
                              <br />
                              <span className="text-xs text-slate-600 dark:text-slate-400 mt-2 block">
                                Min: <strong>{alert.minObservedValue.toFixed(2)}</strong> | Max: <strong>{alert.maxObservedValue.toFixed(2)}</strong>
                              </span>
            </p>
          </div>
        ))
      ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No Alerts</p>
        )}
      </div>
                    {alerts && alerts.length > 0 && (
                      <Button onClick={() => analyseAlert(alerts[0].alertStartUtc)} className="w-full mt-4 relative overflow-hidden rounded-lg px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:brightness-110 shadow-lg transition-all">
                        <span className="flex items-center justify-center gap-2">
                          <Sparkles size={16} />
                          Analyze Alert
                        </span>
                      </Button>
                    )}
      </div>
);




  return (
    <div className="w-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 mt-4">
      <Card className="h-full shadow-xl border-0 bg-white dark:bg-slate-900">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex items-start justify-between w-full">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {selectedAsset?.name || "No Asset Selected"}
                </CardTitle>
                {selectedAsset && (
                  <Badge variant="outline" className="text-xs font-semibold px-3 py-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    ● Live
                  </Badge>
                )}
              </div>
              {selectedAsset && (
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
                  Sub Assets: <span className="text-slate-900 dark:text-slate-100 font-semibold">{subAssetCount}</span>
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 overflow-y-auto" style={{ height: 'calc(100% - 100px)' }}>
          {!selectedAsset ? (
            <div className="text-slate-500 font-semibold text-lg py-12 text-center">Select an asset from the tree.</div>
          ) : (
            <>
              {/* QUICK INFO */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Type</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{assetType}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Level</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedAsset.level}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Status</p>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">Active</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* LEFT COLUMN - Devices & Signals */}
                <div className="space-y-6 order-1 sm:order-1">

                  {/* Connected Devices */}
                  {deviceDetails.length > 0 && (
                    <div className="rounded-lg border border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 p-5">
                      <h3 className="font-bold text-green-900 dark:text-green-100 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Link2 className="h-4 w-4" /> Connected Devices
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {deviceDetails.map((d, idx) => (
                          <span
                            key={idx}
                            className="px-4 py-2 text-xs font-semibold text-green-700 dark:text-green-200 bg-white dark:bg-green-900 rounded-full border border-green-300 dark:border-green-700 shadow-sm hover:shadow-md transition-shadow"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Signal Configuration */}
                  {hasDeviceAssigned && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 p-5">
                      <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <Activity className="h-4 w-4" /> Signal Configuration
                      </h3>
                      <div className="space-y-3">
                        {assetConfig.map(signal => (
                          <div key={signal.mappingId} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{signal.signalName}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Reg: {signal.registerAdress}</p>
                            </div>
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 text-xs font-semibold">{signal.signalUnit}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    {canShowDeviceButton && (
                      hasDeviceAssigned ? (
                        <Button onClick={handleDetachDevice} disabled={detaching} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg transition-all">
                          <Unplug className="h-4 w-4 mr-2" /> Detach Device
                        </Button>
                      ) : (
                        <Button onClick={() => navigate(`/map-device-to-asset/${selectedAsset.assetId}`)} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-lg transition-all">
                          <Link2 className="h-4 w-4 mr-2" /> Manage Connection
                        </Button>
                      )
                    )}
                  </div>
                  <div className="block sm:hidden">
                    <AlertsSection />
                  </div>
                </div>

                {/* RIGHT COLUMN - Alerts & Analysis */}
                <div className="hidden sm:block space-y-6 order-2">
                  {/* Alerts Section */}
                  <AlertsSection />
                </div>

              </div>
              <div ref={recommendationRef} className="mt-4">

                {(aiLoading || recommendation) && (
                  <div className="mt-6 rounded-lg border bg-muted/40 p-4">
                    <h1 className="mb-2 text-lg font-semibold">
                      Recommendations
                    </h1>

                    <p
                      id="recommendation"
                      className="whitespace-pre-line text-sm leading-relaxed"
                    >
                      {aiLoading ? "Wait getting response..." : typedText}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
