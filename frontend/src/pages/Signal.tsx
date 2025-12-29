import React, { useEffect, useMemo, useState,useRef } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAssetHierarchy, getSignalOnAsset } from "@/api/assetApi";
import { getDeviceById } from "@/api/deviceApi";
import { getTelemetryData, TimeRange } from "@/api/telemetryApi";
import type { Asset, SignalType } from "@/api/assetApi";
import { getMappingById } from "@/api/assetApi";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Pin, XCircle } from "lucide-react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
  Dot,
} from "recharts";


/* ------------------------------ Helpers ------------------------------ */
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


function hashStringToInt(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}


function colorForString(str: string) {
  const seed = hashStringToInt(str);
  const rnd = mulberry32(seed);
  const r = Math.floor(rnd() * 200) + 20;
  const g = Math.floor(rnd() * 200) + 20;
  const b = Math.floor(rnd() * 200) + 20;
  return `rgb(${r}, ${g}, ${b})`;
}


/* ---------------------------- Types & Component ---------------------------- */
export default function Signals() {
  const { state } = useLocation();
  const passedAsset = (state as any)?.asset as Asset | undefined | null;
  const [mainAsset, setMainAsset] = useState<Asset | null>(passedAsset ?? null);
  const [deviceName, setDeviceName] = useState("Loading...");
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [compareAssetId, setCompareAssetId] = useState("");
  const [mainSignals, setMainSignals] = useState<SignalType[]>([]);
  const [compareSignals, setCompareSignals] = useState<SignalType[]>([]);
  const [compareDeviceName, setCompareDeviceName] = useState("Loading...");
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "today" | "custom">("today");
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullTelemetryData, setFullTelemetryData] = useState<any[]>([]);
  const [displayedTelemetryData, setDisplayedTelemetryData] = useState<any[]>([]);
  const [fetchingData, setFetchingData] = useState(false);
  const [selectedSignals, setSelectedSignals] = useState<SignalType[]>([]);
  const [compareSelectedSignals, setCompareSelectedSignals] = useState<SignalType[]>([]);
  const [refAreaLeft, setRefAreaLeft] = useState<number | undefined>(undefined);
  const [refAreaRight, setRefAreaRight] = useState<number | undefined>(undefined);
  const [mainSignalDropdownOpen, setMainSignalDropdownOpen] = useState(false);
  const [compareSignalDropdownOpen, setCompareSignalDropdownOpen] = useState(false);
  const mainSignalDropdownRef = useRef<HTMLDivElement | null>(null);
  const compareSignalDropdownRef = useRef<HTMLDivElement | null>(null);

 
  // Reference Point States
  const [referencePoint, setReferencePoint] = useState<{
    time: number;
    values: { [key: string]: number };
  } | null>(null);
  const [isSelectingReference, setIsSelectingReference] = useState(false);


  const flattenAssets = (assets: Asset[]): Asset[] => {
    const out: Asset[] = [];
    const stack = [...assets];
    while (stack.length) {
      const a = stack.shift()!;
      if (a.level > 2) out.push(a);
      if (a.childrens?.length) stack.unshift(...a.childrens);
    }
    return out;
  };


  /* ---------------- Load asset hierarchy ---------------- */
  useEffect(() => {
    const loadHierarchy = async () => {
      setLoading(true);
      try {
        const hierarchy = await getAssetHierarchy();
        setAllAssets(flattenAssets(hierarchy || []));
      } catch (err) {
        console.error("Failed to load asset hierarchy", err);
        setAllAssets([]);
      } finally {
        setLoading(false);
      }
    };
    loadHierarchy();
  }, []);

useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (
      mainSignalDropdownRef.current &&
      !mainSignalDropdownRef.current.contains(e.target as Node)
    ) {
      setMainSignalDropdownOpen(false);
    }

    if (
      compareSignalDropdownRef.current &&
      !compareSignalDropdownRef.current.contains(e.target as Node)
    ) {
      setCompareSignalDropdownOpen(false);
    }
  };

  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, []);


const [zoomRange, setZoomRange] = useState<{
  start: string;
  end: string;
} | null>(null);

const [isZooming, setIsZooming] = useState(false);

  /* ---------------- Load main asset signals & device ---------------- */
  useEffect(() => {
    const loadMainSignals = async () => {
      if (!mainAsset) {
        setDeviceName("Not Assigned");
        setMainSignals([]);
        return;
      }
      try {
        const signalOnAsset = await getSignalOnAsset(mainAsset.assetId);
        if (signalOnAsset?.length > 0) {
          setMainSignals(signalOnAsset);
          const deviceNames = await fetchDevicesForAsset(mainAsset.assetId);
          setDeviceName(deviceNames.join(", "));
        } else {
          setMainSignals([]);
          setDeviceName("Not Assigned");
        }
      } catch (err) {
        console.error("Failed to fetch main asset signals", err);
        setMainSignals([]);
        setDeviceName("Error");
      }
    };
    loadMainSignals();
  }, [mainAsset]);


  // reset signals for main when main asset changes
  useEffect(() => {
    setSelectedSignals([]);
  }, [mainAsset]);


  // reset signals for compare when compare asset changes
  useEffect(() => {
    setCompareSelectedSignals([]);
  }, [compareAssetId]);


  /* ---------------- Compare asset signals & device ---------------- */
  useEffect(() => {
    const loadCompareSignals = async () => {
      if (!compareAssetId) {
        setCompareSignals([]);
        setCompareDeviceName("Not Assigned");
        return;
      }
      try {
        const mappings = await getSignalOnAsset(compareAssetId);
        setCompareSignals(mappings);
        const deviceNames = await fetchDevicesForAsset(compareAssetId);
        setCompareDeviceName(deviceNames.join(", "));
      } catch (err) {
        console.error("Failed to fetch compare asset signals", err);
        setCompareSignals([]);
        setCompareDeviceName("Error");
      }
    };
    loadCompareSignals();
  }, [compareAssetId]);

  const toggleMainSignalSelection = (signal: SignalType) => {
  setSelectedSignals(prev => {
    const exists = prev.some(s => s.signalTypeId === signal.signalTypeId);
    if (exists) {
      return prev.filter(s => s.signalTypeId !== signal.signalTypeId);
    }
    return [...prev, signal];
  });
};

const toggleCompareSignalSelection = (signal: SignalType) => {
  setCompareSelectedSignals(prev => {
    const exists = prev.some(s => s.signalTypeId === signal.signalTypeId);
    return exists
      ? prev.filter(s => s.signalTypeId !== signal.signalTypeId)
      : [...prev, signal];
  });
};




  const fetchDevicesForAsset = async (assetId: string): Promise<string[]> => {
    try {
      const mappings = await getMappingById(assetId);
      const uniqueDeviceIds = Array.from(new Set(mappings.map(m => m.deviceId).filter(Boolean)));
      const deviceNames = await Promise.all(
        uniqueDeviceIds.map(async (deviceId) => {
          try {
            const device = await getDeviceById(deviceId);
            return device?.name ?? device?.data?.name ?? "Not Assigned";
          } catch {
            return "Unknown Device";
          }
        })
      );
      return deviceNames;
    } catch (err) {
      console.error(`Failed to fetch devices for asset ${assetId}`, err);
      return ["Error"];
    }
  };


  /* ---------------- Fetch Telemetry Data (uses backend aggregated data) ---------------- */
  useEffect(() => {
    const fetchTelemetryData = async () => {
      if (selectedSignals.length === 0 && compareSelectedSignals.length === 0) {
        setFullTelemetryData([]);
        setDisplayedTelemetryData([]);
        return;
      }
      if (!mainAsset && !compareAssetId) {
        setFullTelemetryData([]);
        setDisplayedTelemetryData([]);
        return;
      }
      setFetchingData(true);
      try {
        // Determine time range
        let apiTimeRange: TimeRange;
        let startDate: string | undefined;
        let endDate: string | undefined;
        if (timeRange === "24h") {
          apiTimeRange = TimeRange.Last24Hours;
        } else if (timeRange === "7d") {
          apiTimeRange = TimeRange.Last7Days;
        } else if (timeRange === "today") {
          apiTimeRange = TimeRange.Custom;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          startDate = today.toISOString();
          endDate = new Date().toISOString();
        } else if (timeRange === "custom") {
  apiTimeRange = TimeRange.Custom;

  if (isZooming && zoomRange) {
    startDate = zoomRange.start;
    endDate = zoomRange.end;
  } else {
    startDate = customStart?.toISOString();
    endDate = customEnd?.toISOString();
  }
}

 else {
          apiTimeRange = TimeRange.Last24Hours;
        }

        console.log("API PAYLOAD", {
  timeRange,
  isZooming,
  zoomRange,
  customStart,
  customEnd,
  startDate,
  endDate,
});


        // Combine all selected signals from both assets
        const allSignals = [...selectedSignals, ...compareSelectedSignals];
        const dataPromises = allSignals.map(async (signal) => {
          try {
            const response = await getTelemetryData({
              assetId: signal.assetId,
              signalTypeId: signal.signalTypeId,
              timeRange: apiTimeRange,
              startDate,
              endDate,
            });
            return {
              ...response,
              signalKey: `${signal.assetId}-${signal.signalName}`,
              signalName: signal.signalName,
              assetName: allAssets.find(a => a.assetId === signal.assetId)?.name || "Unknown",
            };
          } catch (error) {
            console.error(`Failed to fetch data for signal ${signal.signalName}:`, error);
            return null;
          }
        });


        const results = await Promise.all(dataPromises);
        const validResults = results.filter(r => r !== null);


        // Transform data for recharts - NO aggregation, just use backend data as-is
        if (validResults.length > 0) {
          const timeMap = new Map<number, any>();
          validResults.forEach((result: any) => {
            result.values.forEach((point: any) => {
              const timeKey = new Date(point.time).getTime();
              if (!timeMap.has(timeKey)) {
                timeMap.set(timeKey, { time: timeKey });
              }
              const dataPoint = timeMap.get(timeKey);
              const key = `${result.assetName}-${result.signalName}`;
              dataPoint[key] = point.value;
            });
          });
          const chartData = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
          setFullTelemetryData(chartData);
          setDisplayedTelemetryData(chartData);
        } else {
          setFullTelemetryData([]);
          setDisplayedTelemetryData([]);
        }
      } catch (error) {
        console.error("Failed to fetch telemetry data:", error);
        setFullTelemetryData([]);
        setDisplayedTelemetryData([]);
      } finally {
        setFetchingData(false);
        setIsZooming(false);
      }
    };
    fetchTelemetryData();
  },[
  mainAsset,
  compareAssetId,
  timeRange,
  customStart,
  customEnd,
  zoomRange,
  isZooming,
  allAssets,
  selectedSignals,
  compareSelectedSignals
]);


  /* ---------------- Chart Keys ---------------- */
  const mainKeys = useMemo(() => {
    if (!mainAsset) return [];
    return selectedSignals.map(s => `${mainAsset.name}-${s.signalName}`);
  }, [mainAsset, selectedSignals]);


  const compareKeys = useMemo(() => {
    if (!compareAssetId) return [];
    const assetObj = allAssets.find(a => a.assetId === compareAssetId);
    if (!assetObj) return [];
    return compareSelectedSignals.map(s => `${assetObj.name}-${s.signalName}`);
  }, [compareAssetId, compareSelectedSignals, allAssets]);


  const allKeys = useMemo(() => [...mainKeys, ...compareKeys], [mainKeys, compareKeys]);


  /* ---------------- Reference Point Functions ---------------- */
  const handleChartClick = (e: any) => {
    if (!isSelectingReference || !e || !e.activeLabel) return;
   
    const clickedTime = e.activeLabel;
    const dataPoint = displayedTelemetryData.find(d => d.time === clickedTime);
   
    if (dataPoint) {
      const values: { [key: string]: number } = {};
      allKeys.forEach(key => {
        if (dataPoint[key] != null) {
          values[key] = dataPoint[key];
        }
      });
     
      setReferencePoint({
        time: clickedTime,
        values,
      });
      setIsSelectingReference(false);
    }
  };


  const clearReferencePoint = () => {
    setReferencePoint(null);
    setIsSelectingReference(false);
  };


  const startSelectingReference = () => {
    setIsSelectingReference(true);
  };


  /* ---------------- Zoom Functionality ---------------- */
  // const zoom = () => {
  //   if (isSelectingReference) return;
   
  //   let left = refAreaLeft;
  //   let right = refAreaRight;
  //   if (left === right || right === undefined || left === undefined) {
  //     setRefAreaLeft(undefined);
  //     setRefAreaRight(undefined);
  //     return;
  //   }
  //   if (left > right) [left, right] = [right, left];
  //   const zoomedData = displayedTelemetryData.filter(d => d.time >= left && d.time <= right);
  //   setDisplayedTelemetryData(zoomedData);
  //   setRefAreaLeft(undefined);
  //   setRefAreaRight(undefined);
  // };

const zoom = () => {
  if (isSelectingReference) return;

  let left = refAreaLeft;
  let right = refAreaRight;

  if (left == null || right == null || left === right) {
    setRefAreaLeft(undefined);
    setRefAreaRight(undefined);
    return;
  }

  if (left > right) [left, right] = [right, left];

  setZoomRange({
    start: new Date(left).toISOString(),
    end: new Date(right).toISOString(),
  });

  setIsZooming(true);        // ✅ mark zoom-driven fetch
  setTimeRange("custom");   // triggers API

  setRefAreaLeft(undefined);
  setRefAreaRight(undefined);
};




const zoomOut = () => {
  setZoomRange(null);
  setIsZooming(false);
  setTimeRange("24h"); // or previous range
};



  // /* ---------------- Signal Selection Handlers ---------------- */
  // const handleMainSignalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  //   const selectedOptions = Array.from(e.target.selectedOptions);
  //   const selectedIds = selectedOptions.map(opt => opt.value);
  //   const selected = mainSignals.filter(s => selectedIds.includes(s.signalTypeId));
  //   setSelectedSignals(selected);
  // };


  // const handleCompareSignalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  //   const selectedOptions = Array.from(e.target.selectedOptions);
  //   const selectedIds = selectedOptions.map(opt => opt.value);
  //   const selected = compareSignals.filter(s => selectedIds.includes(s.signalTypeId));
  //   setCompareSelectedSignals(selected);
  // };


  /* ---------------- Custom Tooltip Component ---------------- */
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;


    return (
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
        <p className="font-semibold mb-2">{format(new Date(label), "MMM dd HH:mm:ss")}</p>
       
        {payload.map((entry: any, index: number) => {
          const currentValue = entry.value;
          const signalName = entry.name;
         
          let refValue = null;
          let difference = null;
          let percentChange = null;
         
          if (referencePoint && referencePoint.values) {
            refValue = referencePoint.values[signalName];
            if (refValue != null && currentValue != null) {
              difference = currentValue - refValue;
              percentChange = ((difference / refValue) * 100).toFixed(2);
            }
          }


          return (
            <div key={index} className="mb-2 pb-2 border-b last:border-b-0">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium">{signalName}</span>
              </div>
             
              <div className="ml-5 mt-1 space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Current:</span>
                  <span className="font-semibold">{currentValue?.toFixed(2)}</span>
                </div>
               
                {refValue != null && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Reference: </span>
                      <span className="font-semibold">{refValue.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Difference: </span>
                      <span
                        className={`font-semibold ${
                          difference > 0 ? "text-green-600" : difference < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {difference > 0 ? "+" : ""}
                        {difference?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Change: </span>
                      <span
                        className={`font-semibold ${
                          parseFloat(percentChange) > 0
                            ? "text-green-600"
                            : parseFloat(percentChange) < 0
                            ? "text-red-600"
                            : ""
                        }`}
                      >
                        {parseFloat(percentChange) > 0 ? "+" : ""}
                        {percentChange}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
       
        {referencePoint && (
          <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
            Reference Point: {format(new Date(referencePoint.time), "MMM dd HH:mm:ss")}
          </p>
        )}
      </div>
    );
  };


  /* ---------------- Custom Reference Dot Component ---------------- */
  const ReferencePointDot = (props: any) => {
    const { cx, cy } = props;
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill="#ff6b6b" stroke="#fff" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={3} fill="#fff" />
      </g>
    );
  };


  /* ---------------------- Small Shadcn Single Date Picker ---------------------- */
  const today = new Date();
  function SingleDatePicker({
    value,
    onChange,
    placeholder,
    disabled = (date: Date) => date > today,
  }: {
    value: Date | null;
    onChange: (d: Date | null) => void;
    placeholder?: string;
    disabled?: (date: Date) => boolean;
  }) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP") : placeholder ?? "Pick date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar mode="single" selected={value} onSelect={onChange} disabled={disabled} initialFocus />
        </PopoverContent>
      </Popover>
    );
  }


  /* ---------------------------- JSX ---------------------------- */
  return (
    <div className="p-4 container space-y-6 bg-background text-foreground">
      {/* PAGE TITLE */}
      <h1 className="text-2xl font-bold">Signal Analysis</h1>


      {/* TIME RANGE SECTION */}
      <Card className="tour-time-range">
        <CardHeader>
          <CardTitle>Time Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={timeRange}
            onChange={e => setTimeRange(e.target.value as any)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="today">Today</option>
            <option value="custom">Custom Range</option>
          </select>
          {timeRange === "custom" && (
            <div className="flex items-center space-x-2">
              {/* Start Date */}
              <SingleDatePicker
                value={customStart}
                onChange={setCustomStart}
                placeholder="Start Date"
                disabled={date => date > new Date()}
              />
              <span>to</span>
              {/* End Date */}
              <SingleDatePicker
                value={customEnd}
                onChange={setCustomEnd}
                placeholder="End Date"
                disabled={date => (customStart ? date < customStart : false) || date > new Date()}
              />
            </div>
          )}
        </CardContent>
      </Card>


      {/* 2 CARDS: MAIN + COMPARE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MAIN ASSET CARD */}
        <Card>
          <CardHeader>
            <CardTitle>Selected Asset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Asset Dropdown */}
            <div>
              <label className="block mb-2 font-semibold">Select Asset:</label>
              <select
                value={mainAsset?.assetId ?? ""}
                onChange={e =>
                  setMainAsset(allAssets.find(a => a.assetId === e.target.value) ?? null)
                }
               className="tour-main-asset-dropdown w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">--Select Asset--</option>
                {allAssets.map(a => (
                  <option key={a.assetId} value={a.assetId}>
                    {a.name} (Level {a.level})
                  </option>
                ))}
              </select>
            </div>


            {/* Signal Selection - Multiple Select */}
              <div ref={mainSignalDropdownRef} className="relative">
                  <label className="block mb-2 font-semibold">
                    Signals ({selectedSignals.length} selected)
                  </label>

                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => setMainSignalDropdownOpen(o => !o)}
                    disabled={!mainSignals.length}
                  >
                    {selectedSignals.length === 0
                      ? "Select signals"
                      : `${selectedSignals.length} signal(s) selected`}
                  </Button>

                  {mainSignalDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border bg-white dark:bg-gray-800 shadow-lg">
                      {mainSignals.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No signals available
                        </p>
                      ) : (
                        mainSignals.map(signal => (
                          <div
                            key={signal.signalTypeId}
                            className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={() => toggleMainSignalSelection(signal)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSignals.some(
                                s => s.signalTypeId === signal.signalTypeId
                              )}
                              readOnly
                              className="w-4 h-4"
                            />
                            <span>{signal.signalName}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {selectedSignals.length > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Selected: {selectedSignals.map(s => s.signalName).join(", ")}
                    </p>
                  )}
                </div>



            {/* Device */}
            <div>
              <label className="tour-main-device block mb-2 font-semibold">Assigned Device:</label>
              <p className="text-foreground">{deviceName ? deviceName.split(",").map((d, idx) => <span key={idx}>{d}</span>) : "Not Assigned"}</p>
            </div>
          </CardContent>
        </Card>


        {/* COMPARE ASSET CARD */}
        <Card>
          <CardHeader>
            <CardTitle>Compare Asset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block mb-2 font-semibold">Select Asset:</label>
              {loading ? (
                <p>Loading...</p>
              ) : (
                <select
                  value={compareAssetId}
                  onChange={e => setCompareAssetId(e.target.value)}
                  disabled={!mainAsset}
                  className="tour-compare-dropdown w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">None</option>
                  {allAssets
                    .filter(a => a.assetId !== mainAsset?.assetId)
                    .map(a => (
                      <option key={a.assetId} value={a.assetId}>
                        {a.name} (Level {a.level})
                      </option>
                    ))}
                </select>
              )}
            </div>


            {compareAssetId && (
              <>
                {/* Compare Signal Selection - Multiple Select */}
               <div ref={compareSignalDropdownRef} className="relative">
                <label className="block mb-2 font-semibold">
                  Signals ({compareSelectedSignals.length} selected)
                </label>

                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setCompareSignalDropdownOpen(o => !o)}
                  disabled={!compareSignals.length}
                >
                  {compareSelectedSignals.length === 0
                    ? "Select signals"
                    : `${compareSelectedSignals.length} signal(s) selected`}
                </Button>

                {compareSignalDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border bg-white dark:bg-gray-800 shadow-lg">
                    {compareSignals.map(signal => (
                      <div
                        key={signal.signalTypeId}
                        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => toggleCompareSignalSelection(signal)}
                      >
                        <input
                          type="checkbox"
                          checked={compareSelectedSignals.some(
                            s => s.signalTypeId === signal.signalTypeId
                          )}
                          readOnly
                          className="w-4 h-4"
                        />
                        <span>{signal.signalName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>



                {/* Device */}
                <div>
                  <label className="block mb-2 font-semibold">Assigned Device:</label>
                  <p className="text-foreground">
                    {compareDeviceName
                      ? compareDeviceName.split(",").map((d, idx) => <span key={idx}>{d}</span>)
                      : "Not Assigned"}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>


      {/* GRAPH CARD */}
      <Card className="tour-graph-card">
        <CardHeader>
          <CardTitle>Signals Graph</CardTitle>
          {fetchingData && <p className="text-sm text-gray-500">Loading data...</p>}
        </CardHeader>
        <CardContent className="bg-card text-card-foreground">
          {fetchingData ? (
            <div className="flex justify-center items-center h-96">
              <p className="text-lg">Loading telemetry data...</p>
            </div>
          ) : fullTelemetryData.length === 0 ? (
            <div className="flex h-96 items-center justify-center rounded-lg border border-border bg-card">
                <p className="text-lg text-muted-foreground">
                No data available. Please select an asset and signals.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <Button onClick={zoomOut}>Zoom Out</Button>
                  <Button
                    onClick={startSelectingReference}
                    disabled={isSelectingReference}
                    variant={isSelectingReference ? "default" : "outline"}
                    className="flex items-center gap-2"
                  >
                    <Pin className="w-4 h-4" />
                    {isSelectingReference ? "Click on chart to set..." : "Set Reference Point"}
                  </Button>
                  {referencePoint && (
                    <Button
                      onClick={clearReferencePoint}
                      variant="destructive"
                      className="flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Clear Reference Point
                    </Button>
                  )}
                </div>
               
                {referencePoint && (
                  <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
                    <p className="font-semibold text-sm">
                      Reference Point: {format(new Date(referencePoint.time), "MMM dd HH:mm:ss")}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(referencePoint.values).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground">{key}:</span>
                          <span className="font-semibold">{value.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
               
                {isSelectingReference && (
                  <div className="rounded-md border border-primary/30 bg-primary/10 text-primary">
                    <p className="text-sm font-semibold text-green-800">
                      🎯 Click on any point in the chart below to set as reference
                    </p>
                  </div>
                )}
               
                <p className="text-sm text-muted-foreground">
                  {isSelectingReference
                    ? "Click on the chart to set reference point"
                    : "Drag on chart to zoom into a time range"}
                </p>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={displayedTelemetryData}
                  onClick={handleChartClick}
                  onMouseDown={e => !isSelectingReference && e && setRefAreaLeft(e.activeLabel as number)}
                  onMouseMove={e => !isSelectingReference && refAreaLeft && e && setRefAreaRight(e.activeLabel as number)}
                  onMouseUp={() => !isSelectingReference && zoom()}
                  style={{ cursor: isSelectingReference ? "crosshair" : "default" }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={tick => format(new Date(tick), "MMM dd HH:mm")}
                  />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                 
                  {/* Reference Line */}
                  {referencePoint && (
                    <ReferenceLine
                      x={referencePoint.time}
                      stroke="#ff6b6b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: "Reference",
                        position: "top",
                        fill: "#ff6b6b",
                        fontSize: 12,
                      }}
                    />
                  )}
                 
                  {allKeys.map(key => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={colorForString(key)}
                      name={key}
                      dot={
                        referencePoint && referencePoint.time
                          ? (props: any) => {
                              if (props.payload.time === referencePoint.time) {
                                return <ReferencePointDot {...props} />;
                              }
                              return <Dot {...props} r={0} />;
                            }
                          : false
                      }
                      strokeWidth={2}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                 
                  {!isSelectingReference && refAreaLeft && refAreaRight ? (
                    <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
