import { useEffect, useMemo, useState, useRef } from "react";
import apiAsset from "@/api/axiosAsset";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, Area, AreaChart } from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Download, TrendingUp, AlertTriangle, Clock, Activity } from "lucide-react";
import "jspdf-autotable";
import autoTable from "jspdf-autotable";
import { useParams } from "react-router-dom";



// -------------------- Utilities --------------------
const formatLocalTime = (utcString: string | undefined) => {
  if (!utcString) return "-";
  return new Date(utcString + "Z").toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
};

const formatLocalDate = (utcString: string | undefined) => {
  if (!utcString) return "-";
  return new Date(utcString + "Z").toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};



const formatLocalHourMin = (utcString: string | undefined) => {
  if (!utcString) return "-";
  return new Date(utcString + "Z").toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
};


const getDurationSec = (a: any) => {
  const start = new Date(a.alertStartUtc).getTime();
  const end = a.alertEndUtc
    ? new Date(a.alertEndUtc).getTime()
    : Date.now();
  return (end - start) / 1000;
};


const getDeviation = (a: any) => {
  if (a.maxObservedValue > a.maxThreshold) {
    return { percent: ((a.maxObservedValue - a.maxThreshold) / (a.maxThreshold || 1)) * 100, direction: "UP" };
  }
  if (a.minObservedValue < a.minThreshold) {
    return { percent: ((a.minThreshold - a.minObservedValue) / (a.minThreshold || 1)) * 100, direction: "DOWN" };
  }
  return { percent: 0, direction: "NONE" };
};

const getSeverity = (percent: number) => {
  if (percent >= 25) return "Critical";
  if (percent >= 10) return "Medium";
  return "Low";
};

// -------------------- Component --------------------
export default function AlertsAnalyticsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [signalFilter, setSignalFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [deviationRange, setDeviationRange] = useState([0, 1000]);
  const [fromLocal, setFromLocal] = useState<string>("");
  const [toLocal, setToLocal] = useState<string>("");
  const [preset, setPreset] = useState<string>("24h");
  const [loading, setLoading] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);
  let {assetId} = useParams()

const istToUtcISOString = (ist: string) => {
  const localDate = new Date(ist);
  const utcTime = new Date(
    localDate.getTime() - localDate.getTimezoneOffset() * 60000
  );
  return utcTime.toISOString();
};

const [fromUtc, toUtc] = useMemo(() => {
  // If user selected 'to', otherwise default to now
  const toIST = toLocal ? new Date(toLocal) : new Date();
  let fromIST: Date;

  if (fromLocal) {
    fromIST = new Date(fromLocal);
  } else {
    switch (preset) {
      case "24h":
        fromIST = new Date(toIST.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "2d":
        fromIST = new Date(toIST.getTime() - 2 * 24 * 60 * 60 * 1000);
        break;
      case "7d":
        fromIST = new Date(toIST.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "1m":
        fromIST = new Date(toIST.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        fromIST = new Date(toIST.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  // Convert IST -> UTC
  const toUtcString = new Date(toIST.getTime() - 5.5 * 60 * 60 * 1000).toISOString();
  const fromUtcString = new Date(fromIST.getTime() - 5.5 * 60 * 60 * 1000).toISOString();

  return [fromUtcString, toUtcString];
}, [fromLocal, toLocal, preset]);



  const loadAlerts = async () => {
    setLoading(true);
    try {
      const response = await apiAsset.get("/alerts", { params: { fromUtc, toUtc , assetId} });
      setAlerts(response.data);
    } catch (error) {
      console.error("Failed to load alerts", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAlerts(); }, [fromUtc, toUtc]);

  const enrichedAlerts = useMemo(() => alerts.map(a => {
    const dev = getDeviation(a);
    return {
      ...a,
      deviationPercent: Number(dev.percent.toFixed(2)),
      deviationDirection: dev.direction,
      severity: getSeverity(dev.percent),
      durationSec: getDurationSec(a),
    };
  }), [alerts]);

  const filtered = enrichedAlerts.filter(a => {
    if (signalFilter !== "ALL" && a.signalName !== signalFilter) return false;
    if (severityFilter !== "ALL" && a.severity !== severityFilter) return false;
    //if (a.deviationPercent < deviationRange[0] || a.deviationPercent > deviationRange[1]) return false;
    return true;
  });

  const signals = Array.from(new Set(alerts.map(a => a.signalName)));

  const stats = useMemo(() => {
    const total = filtered.length;
    const critical = filtered.filter(a => a.severity === "Critical").length;
    const avgDeviation = filtered.length > 0 ? (filtered.reduce((sum, a) => sum + a.deviationPercent, 0) / filtered.length).toFixed(2) : 0;
    const totalDuration = filtered.reduce((sum, a) => sum + a.durationSec, 0);
    return { total, critical, avgDeviation, totalDuration };
  }, [filtered]);

  // -------------------- Export with Charts --------------------
 const exportWithChartsPDF = async () => {
  try {
    if (!chartsRef.current) {
      alert("Charts not loaded yet. Please wait.");
      return;
    }

    const canvas = await html2canvas(chartsRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const ratio = canvas.width / canvas.height;
    const imgHeight = (pdfWidth - 20) / ratio;

    // Page 1 – Charts
    pdf.setFontSize(16);
    pdf.text("Alerts Analytics Report", 10, 12);
    pdf.addImage(imgData, "PNG", 10, 20, pdfWidth - 20, imgHeight);

    // Page 2 – Table
    pdf.addPage();
    pdf.setFontSize(16);
    pdf.text("Detailed Alerts Data", 10, 15);

    const tableData = filtered.slice(0, 50).map(a => [
      a.assetName,
      a.signalName,
      formatLocalTime(a.alertStartUtc),
      `${a.deviationPercent.toFixed(2)}%`,
      a.severity,
      a.isActive ? "Active" : "Closed"
    ]);

    autoTable(pdf, {
      head: [["Asset", "Signal", "Start Time (IST)", "Deviation", "Severity", "Status"]],
      body: tableData,
      startY: 25,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      margin: { left: 10, right: 10 }
    });

    pdf.save("alerts_report.pdf");
  } catch (err) {
    console.error("PDF export error:", err);
    alert("Failed to export PDF.");
  }
};


  const exportExcel = () => {
    const ws1 = XLSX.utils.json_to_sheet(filtered.map(a => ({
      Asset: a.assetName,
      Signal: a.signalName,
      StartTime: formatLocalTime(a.alertStartUtc),
      EndTime: formatLocalTime(a.alertEndUtc),
      DurationSec: a.durationSec,
      DeviationPercent: a.deviationPercent,
      Severity: a.severity,
      Status: a.isActive ? "Active" : "Closed"
    })));

    const statsData = [
      { Metric: "Total Alerts", Value: stats.total },
      { Metric: "Critical Alerts", Value: stats.critical },
      { Metric: "Avg Deviation %", Value: stats.avgDeviation },
      { Metric: "Total Duration (sec)", Value: stats.totalDuration }
    ];
    const ws2 = XLSX.utils.json_to_sheet(statsData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Alerts");
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    XLSX.writeFile(wb, "alerts_report.xlsx");
  };

  const exportCSV = () => {
    const data = filtered.map(a => ({
      Asset: a.assetName,
      Signal: a.signalName,
      StartTime: formatLocalTime(a.alertStartUtc),
      EndTime: formatLocalTime(a.alertEndUtc),
      DurationSec: a.durationSec,
      DeviationPercent: a.deviationPercent,
      Severity: a.severity,
      Status: a.isActive ? "Active" : "Closed"
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "alerts_report.csv";
    a.click();
  };

  // -------------------- UI --------------------
  return (
<div className="h-full lg:overflow-hidden bg-gray-50">
      {/* Header */}

<div className="flex items-center justify-between max-w-7xl mx-4 px-0 py-2">
  <div>
    <h1 className="text-3xl font-bold text-gray-900">
      Alerts Analytics Dashboard
    </h1>
    <p className="text-gray-500 text-sm">
      Real-time monitoring and insights
    </p>
  </div>

  <div className="flex flex-wrap gap-2 mt-3 md:mt-0">
    <Button onClick={exportCSV} variant="outline" className="gap-2 border-gray-300 hover:bg-gray-50">
      <Download size={16} /> CSV
    </Button>
    <Button onClick={exportExcel} variant="outline" className="gap-2 border-gray-300 hover:bg-gray-50">
      <Download size={16} /> Excel
    </Button>
    <Button onClick={exportWithChartsPDF} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
      <Download size={16} /> PDF + Charts
    </Button>
  </div>
</div>




      <div className="max-w mx-auto px-2 py-2 space-y-4">


        {/* Filters */}
        <Card className="border-gray-200 shadow-sm ">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">From (IST)</label>
                <Input 
                  type="datetime-local" 
                  value={fromLocal} 
                  onChange={e => setFromLocal(e.target.value)} 
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">To (IST)</label>
                <Input 
                  type="datetime-local" 
                  value={toLocal} 
                  onChange={e => setToLocal(e.target.value)} 
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Preset</label>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-md">
                    <SelectItem value="24h" className="text-gray-900">Past 1 Day</SelectItem>
                    <SelectItem value="2d" className="text-gray-900">Past 2 Days</SelectItem>
                    <SelectItem value="7d" className="text-gray-900">Past 7 Days</SelectItem>
                    <SelectItem value="1m" className="text-gray-900">Past 1 Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Signal</label>
                <Select value={signalFilter} onValueChange={setSignalFilter}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-md">
                    <SelectItem value="ALL">All Signals</SelectItem>
                    {signals.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Severity</label>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-md">
                    <SelectItem value="ALL">All Severity</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Deviation %</label>
                <Slider 
                  value={deviationRange} 
                  max={1000} 
                  step={5} 
                  onValueChange={setDeviationRange}
                  className="mt-3"
                />
                <p className="text-xs text-gray-500 mt-1">{deviationRange[0]} - {deviationRange[1]}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content - Left: Signals, Right: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* LEFT SIDE - Alert Cards */}
  <Card className="border-gray-200 w-full lg:col-span-3 shadow-sm h-[420px] md:h-[520px]">
  <CardContent className="p-4 h-full flex flex-col">
    
    {/* Header (Fixed) */}
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-bold text-gray-900">Alert Details</h2>
      <Badge variant="outline" className="border-gray-300 text-gray-700">
        {filtered.length} items
      </Badge>
    </div>

    {/* Content Area */}
    {loading ? (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    ) : filtered.length === 0 ? (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">
          No alerts found matching your criteria
        </p>
      </div>
    ) : (
      /* 🔥 Scrollable List */
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {filtered.map((a) => (
          <Card
            key={a.alertId}
            className={`border-l-4 shadow-sm hover:shadow-md transition-all ${
              a.severity === "Critical"
                ? "border-l-red-600 bg-red-50"
                : a.severity === "Medium"
                ? "border-l-amber-600 bg-amber-50"
                : "border-l-green-600 bg-green-50"
            }`}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-900">{a.assetName}</p>
                  <p className="text-xs text-gray-600">{a.signalName}</p>
                </div>
                <Badge
                  className={
                    a.severity === "Critical"
                      ? "bg-red-600"
                      : a.severity === "Medium"
                      ? "bg-amber-600"
                      : "bg-green-600"
                  }
                >
                  {a.severity}
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Start Time:</span>
                  <span className="font-mono font-semibold">
                    {formatLocalTime(a.alertStartUtc)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Threshold:</span>
                  <span className="font-mono">
                    {a.minThreshold} – {a.maxThreshold}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Observed:</span>
                  <span className="font-mono">
                    {a.minObservedValue} – {a.maxObservedValue}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span className="font-semibold">
                    {(a.durationSec / 60).toFixed(1)} min
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Deviation</span>
                  <span className="text-lg font-bold text-blue-600">
                    {a.deviationPercent}%
                  </span>
                </div>
                <p className="text-xs text-right text-gray-600">
                  {a.deviationDirection === "UP"
                    ? "↑ Over Threshold"
                    : a.deviationDirection === "DOWN"
                    ? "↓ Under Threshold"
                    : "Within Range"}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )}
  </CardContent>
</Card>


          {/* RIGHT SIDE - Charts */}
          <div className="w-full lg:col-span-2" ref={chartsRef}>
  <div className="space-y-4 bg-white p-4 md:p-6 rounded-lg border border-gray-200 shadow-sm h-[360px] md:h-[520px]">
    <h2 className="text-xl font-bold text-gray-900">Analytics Charts</h2>

    <div className="space-y-2">
      {/* Chart Card */}
      <Card className="border-gray-200 ">
        <CardContent className="h-64 md:h-80 p-3 md:p-4">
          
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered}>
              <defs>
                <linearGradient id="colorDev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="alertStartUtc" tickFormatter={formatLocalHourMin} stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip labelFormatter={formatLocalTime} contentStyle={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }} />
              <Legend />
              <Area type="monotone" dataKey="deviationPercent" stroke="#2563eb" fill="url(#colorDev)" name="Deviation %" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Warning Note */}
      <div className="p-2 bg-yellow-50 border-l-4 border-red-700 text-yellow-700 text-sm rounded">
        <p><strong>Warning Levels:</strong></p>
        <ul className="ml-4 list-disc">
          <li>Critical: deviation ≥ 25%</li>
          <li>Medium: deviation ≥ 10%</li>
          <li>Low: deviation &lt; 10%</li>
        </ul>
      </div>
    </div>
  </div>
</div>

        </div>
      </div>
    </div>
  );
}