import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import api from "@/api/axios";
import { toast } from "react-toastify";

const DEVICE_NAME_RE = /^[A-Za-z0-9 _-]+$/;

type ParsedRow = Record<string, unknown> & { __rowNum?: number };

type Device = {
  name: string;
  description?: string | null;
  sourceRows: number[];
};

type FieldError = {
  deviceIndex: number;
  field: "name" | "description";
  messages: string[];
  rowInfo?: string;
};

type ApiResponse = {
  createdDeviceIds?: string[];
  errors?: string[];
};

const REQUIRED_HEADERS = ["devicename"];

export default function DeviceBulkUpload() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* -------------------- Utils -------------------- */

  const normalizeKey = (k: string | undefined) =>
    String(k || "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

  function hasRequiredHeaders(data: Record<string, unknown>[]) {
    if (!data.length) return false;
    const headers = Object.keys(data[0]).map(normalizeKey);
    return REQUIRED_HEADERS.every(h => headers.includes(h));
  }

  function dedupAndMap(rows: ParsedRow[]): Device[] {
    const map = new Map<string, Device>();

    rows.forEach(r => {
      const norm: Record<string, unknown> = {};
      Object.keys(r).forEach(k => (norm[normalizeKey(k)] = r[k]));

      const name = String(norm["devicename"] ?? "").trim();
      const desc = String(norm["devicedescription"] ?? "").trim();
      const rowNum = r.__rowNum;

      if (!name) return;

      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name,
          description: desc || null,
          sourceRows: rowNum ? [rowNum] : [],
        });
      } else {
        map.get(key)!.sourceRows.push(rowNum!);
      }
    });

    return Array.from(map.values());
  }

  /* -------------------- Validation -------------------- */

  function validate(devs: Device[]) {
    const global: string[] = [];
    const flat: FieldError[] = [];
    const seen = new Map<string, number>();

    if (devs.length > 20) {
      global.push(`Maximum 20 devices allowed (found ${devs.length})`);
    }

    devs.forEach((d, i) => {
      const rowInfo = d.sourceRows.length
        ? `Rows: ${d.sourceRows.join(", ")}`
        : "";

      if (!d.name.trim()) {
        flat.push({
          deviceIndex: i,
          field: "name",
          messages: ["DeviceName is required"],
          rowInfo,
        });
      } else {
        if (d.name.length < 3 || d.name.length > 100) {
          flat.push({
            deviceIndex: i,
            field: "name",
            messages: ["DeviceName must be 3–100 characters"],
            rowInfo,
          });
        }
        if (!DEVICE_NAME_RE.test(d.name)) {
          flat.push({
            deviceIndex: i,
            field: "name",
            messages: ["Invalid characters in DeviceName"],
            rowInfo,
          });
        }
      }

      if (d.description && d.description.length > 255) {
        flat.push({
          deviceIndex: i,
          field: "description",
          messages: ["Description max length is 255"],
          rowInfo,
        });
      }

      const key = d.name.toLowerCase();
      if (seen.has(key)) {
        flat.push({
          deviceIndex: i,
          field: "name",
          messages: ["Duplicate device name"],
          rowInfo,
        });
      } else {
        seen.set(key, i);
      }
    });

    return { global, fieldErrors: flat };
  }

  useEffect(() => {
    const { global, fieldErrors } = validate(devices);
    setGlobalErrors(global);
    setFieldErrors(fieldErrors);
  }, [devices]);

  /* -------------------- File Handling -------------------- */

  function handleFile(file: File) {
    const fileName = file.name.toLowerCase();

    const processRows = (data: Record<string, unknown>[]) => {
      if (!data.length) {
        toast.error("Uploaded file is empty");
        return;
      }

      if (!hasRequiredHeaders(data)) {
        toast.error("Required column: DeviceName");
        return;
      }

      const annotated = data.map((r, i) => ({ __rowNum: i + 2, ...r }));
      const mapped = dedupAndMap(annotated);

      if (!mapped.length) {
        toast.error("No valid devices found");
        return;
      }

      setDevices(mapped);
      setApiResponse(null);
      toast.info(`${mapped.length} devices ready to upload`);
    };

    if (fileName.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: res => processRows(res.data as any[]),
      });
      return;
    }

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = e => {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        processRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[]);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    toast.error("Unsupported file format");
  }

  /* -------------------- Error Excel -------------------- */

  function downloadErrorExcel(errors: FieldError[]) {
    const rows = errors.map((e, i) => ({
      "Sr No": i + 1,
      "Device Name": devices[e.deviceIndex]?.name ?? "",
      "Error": e.messages.join(", "),
      "Rows": e.rowInfo ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, "device_upload_errors.xlsx");
  }

  /* -------------------- Save -------------------- */

  async function handleSave() {
    const { global, fieldErrors } = validate(devices);
    if (global.length || fieldErrors.length) return;

    setSaving(true);
    try {
      const res = await api.post("/devices/bulk", {
        devices: devices.map(d => ({
          name: d.name.trim(),
          description: d.description?.trim() ?? null,
        })),
      });

      setApiResponse(res.data);
      setDevices([]);
      toast.success("Device bulk upload completed");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  /* -------------------- UI -------------------- */

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle className="text-sm">Device Bulk Upload</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Template */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Download sample Excel template
          </span>
          <a href="/industrial_devices.xlsx" download>
            <Button size="sm" variant="outline">Download Template</Button>
          </a>
        </div>

        {/* Upload */}
        <div
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]);
          }}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={cn(
            "rounded-lg p-4 border flex justify-between cursor-pointer",
            dragOver && "border-primary bg-primary/5"
          )}
        >
          <div>
            <div className="font-medium">Upload CSV / Excel</div>
            <div className="text-xs text-muted-foreground">
              DeviceName, DeviceDescription
            </div>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".csv,.xlsx,.xls"
              onChange={e => e.target.files && handleFile(e.target.files[0])}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </Button>
          </div>
        </div>

        <Separator />

        {/* Result */}
        {apiResponse && apiResponse.errors?.length && (
          <div className="flex justify-between text-sm text-yellow-700">
            <span>{apiResponse.errors.length} devices skipped</span>
            <Button size="sm" variant="outline" onClick={() => downloadErrorExcel(fieldErrors)}>
              Download Error Report
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button disabled={!devices.length || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Devices"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
