import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import apiAsset from "@/api/axiosAsset";
import { toast } from "react-toastify";

type ParsedRow = Record<string, unknown> & { __rowNum?: number };

type Asset = {
  assetName: string;
  parentName?: string | null;
  level: number;
  sourceRows: number[];
};

type FieldError = {
  assetIndex: number;
  field: "assetName" | "parentName" | "level";
  messages: string[];
  rowInfo?: string;
};

type ApiResponse = {
  addedAssets: string[];
  skippedAssets: string[];
};

const ASSET_NAME_RE = /^[A-Za-z0-9 _-]+$/;

export default function AssetBulkUpload() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizeKey = (k: string | undefined) =>
    String(k || "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

  const REQUIRED_HEADERS = ["assetname", "level"];

  function hasRequiredHeaders(data: Record<string, unknown>[]) {
    if (!data.length) return false;

    const headers = Object.keys(data[0]).map((h) =>
      normalizeKey(h)
    );

    return REQUIRED_HEADERS.every((h) => headers.includes(h));
  }

  function dedupAndMap(parsedRows: ParsedRow[]): Asset[] {
    const map = new Map<string, Asset>();

    for (const r of parsedRows) {
      const normalized: Record<string, unknown> = {};
      for (const k of Object.keys(r)) {
        normalized[normalizeKey(k)] = r[k];
      }

      const assetName = String(normalized["assetname"] ?? "").trim();
      const parentName = String(normalized["parentname"] ?? "").trim();
      const level = Number(normalized["level"] ?? 0);
      const rowNum = r.__rowNum ?? null;

      if (!assetName) continue;

      const key = assetName.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          assetName,
          parentName: parentName || null,
          level: isNaN(level) ? 0 : level,
          sourceRows: rowNum ? [rowNum] : [],
        });
      } else {
        map.get(key)!.sourceRows.push(rowNum!);
      }
    }

    return Array.from(map.values());
  }

  function validate(astList: Asset[]) {
    const global: string[] = [];
    const flatErrors: FieldError[] = [];
    const seen = new Map<string, number>();

    if (astList.length > 20) {
      global.push(`Maximum 20 assets allowed (found ${astList.length})`);
    }

    astList.forEach((a, i) => {
      const rowInfo =
        a.sourceRows.length ? `Rows: ${a.sourceRows.join(",")}` : "";

      if (!a.assetName.trim()) {
        flatErrors.push({
          assetIndex: i,
          field: "assetName",
          messages: ["AssetName is required"],
          rowInfo,
        });
      }

      if (a.assetName.length < 3 || a.assetName.length > 100) {
        flatErrors.push({
          assetIndex: i,
          field: "assetName",
          messages: ["AssetName must be 3-100 characters"],
          rowInfo,
        });
      }

      if (!ASSET_NAME_RE.test(a.assetName)) {
        flatErrors.push({
          assetIndex: i,
          field: "assetName",
          messages: ["AssetName contains invalid characters"],
          rowInfo,
        });
      }

      if (a.level <= 0 || !Number.isInteger(a.level)) {
        flatErrors.push({
          assetIndex: i,
          field: "level",
          messages: ["Level must be a positive integer"],
          rowInfo,
        });
      }

      const key = a.assetName.toLowerCase();
      if (seen.has(key)) {
        flatErrors.push({
          assetIndex: i,
          field: "assetName",
          messages: ["Duplicate asset name"],
          rowInfo,
        });
      } else {
        seen.set(key, i);
      }
    });

    return { global, fieldErrors: flatErrors };
  }

  useEffect(() => {
    const { global, fieldErrors } = validate(assets);
    setGlobalErrors(global);
    setFieldErrors(fieldErrors);
  }, [assets]);

  const openFilePicker = () => fileInputRef.current?.click();


function downloadErrorExcel(skippedAssets: any[]) {
  const rows = skippedAssets.map((s, index) => ({
    "Sr No": index + 1,
    "Asset Name": typeof s === "string" ? s : s.assetName ?? "",
    "Error Reason": typeof s === "string" ? "Validation failed" : s.reason ?? "",
  }));

  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Sr No", "Asset Name", "Error Reason"], // explicit header row
    ...rows.map((r) => [r["Sr No"], r["Asset Name"], r["Error Reason"]]),
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Upload Errors");

  XLSX.writeFile(workbook, "asset_upload_errors.xlsx", {
    bookType: "xlsx",
    type: "binary",
  });
}



  function handleFile(file: File) {
    const fileName = file.name.toLowerCase();

    const processRows = (data: Record<string, unknown>[]) => {
      if (!data.length) return toast.error("Uploaded file is empty");
      if (!hasRequiredHeaders(data))
        return toast.error("Required columns: AssetName, ParentName, Level");

      const annotated = data.map((r, i) => ({ __rowNum: i + 2, ...r }));
      const parsedAssets = dedupAndMap(annotated);

      if (!parsedAssets.length)
        return toast.error("No valid assets found");

      setAssets(parsedAssets);
      toast.info(`${parsedAssets.length} assets ready to save`);
    };

    if (fileName.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => processRows(res.data as any[]),
      });
      return;
    }

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        processRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[]);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    toast.error("Invalid file format");
  }

  async function handleSave() {
    const { global, fieldErrors } = validate(assets);
    if (global.length || fieldErrors.length) return;

    setSaving(true);
    try {
      const res = await apiAsset.post("/AssetHierarchy/bulk-upload", {
        assets: assets.map((a) => ({
          assetName: a.assetName.trim(),
          parentName: a.parentName?.trim() ?? null,
          level: a.level,
        })),
      });

      setApiResponse(res.data);
      setAssets([]);
      //toast.success("Assets uploaded successfully");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Asset upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle className="text-sm">Asset Bulk Upload</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Template Download */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Download sample Excel to see required format
          </span>
          <a href={`${window.location.origin}/asset_template.xlsx`} download>
            <Button size="sm" variant="outline">
              Download Template
            </Button>
          </a>
        </div>

        {/* Upload Area */}
        <div
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={`rounded-lg p-4 border flex justify-between cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : ""
          }`}
        >
          <div>
            <div className="font-medium">Upload CSV / Excel</div>
            <div className="text-xs text-muted-foreground">
              AssetName, ParentName, Level
            </div>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".csv,.xlsx,.xls"
              onChange={(e) =>
                e.target.files && handleFile(e.target.files[0])
              }
            />
            <Button size="sm" onClick={openFilePicker}>
              Choose file
            </Button>
          </div>
        </div>

        <Separator />

{apiResponse && (
  <div className="rounded-md border p-3 space-y-3 bg-muted/30">
    <div className="text-sm font-medium">Upload Result</div>

    {/* Added Assets */}
    {apiResponse.addedAssets?.length > 0 && (
      <div className="text-sm text-green-600">
        ✅ {apiResponse.addedAssets.length} assets added successfully
      </div>
    )}

    {/* Skipped Assets */}
    {apiResponse.skippedAssets?.length > 0 && (
      <>
        {apiResponse.skippedAssets.length <= 5 ? (
          <div className="text-sm text-yellow-600">
            <div className="font-medium">Skipped Assets:</div>
            <ul className="list-disc ml-5">
              {apiResponse.skippedAssets.map((s: any, i: number) => (
                <li key={i}>
                  {s.assetName ?? s}
                  {s.reason ? ` - ${s.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm text-yellow-700">
            <span>
              ⚠️ {apiResponse.skippedAssets.length} assets skipped due to errors
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadErrorExcel(apiResponse.skippedAssets)
              }
            >
              Download Error Report
            </Button>
          </div>
        )}
      </>
    )}
  </div>
)}

        {/* Save */}
        <div className="flex justify-end">
          <Button disabled={!assets.length || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Assets"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
