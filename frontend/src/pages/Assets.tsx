import React, { useEffect, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Bot } from 'lucide-react';
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { AssetTree } from "@/asset/AssetTree";
import AssetDetails from "@/asset/AssetDetails";
import AssignDevice from "@/asset/AssignDevice";

import { getAssetHierarchy } from "@/api/assetApi";
import { useAuth } from "@/context/AuthContext";
import UploadAssetCsv from "@/asset/UploadAssetCsv";

import { toast } from "react-toastify";
import { Spinner } from "@/components/ui/spinner";

// -------------------- Types --------------------
export type BackendAsset = {
  assetId: string;
  name: string;
  childrens: BackendAsset[];
  parentId: string | null;
  level: number;
  isDeleted: boolean;
};

// -------------------- Normalize Backend Data --------------------
const normalizeAssets = (assets: BackendAsset[]): BackendAsset[] => {
  return assets.map(a => ({
    ...a,
    childrens: Array.isArray(a.childrens) ? normalizeAssets(a.childrens) : [],
  }));
};

// -------------------- Helper Functions --------------------
const removeAssetById = (assets: BackendAsset[], id: string): BackendAsset[] => {
  return assets
    .filter(a => a.assetId !== id)
    .map(a => ({
      ...a,
      childrens: removeAssetById(a.childrens ?? [], id),
    }));
};

const addAssetToTree = (
  list: BackendAsset[],
  parentId: string | null,
  newAsset: BackendAsset
): BackendAsset[] => {
  if (!parentId) return [...list, newAsset];

  return list.map(asset =>
    asset.assetId === parentId
      ? { ...asset, childrens: [...(asset.childrens ?? []), newAsset] }
      : { ...asset, childrens: addAssetToTree(asset.childrens ?? [], parentId, newAsset) }
  );
};

// -------------------- Component --------------------
export default function Assets() {
  const [assets, setAssets] = useState<BackendAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<BackendAsset | null>(null);
  const [assignedDevice, setAssignedDevice] = useState<any>(null);
  const [showAssignDevice, setShowAssignDevice] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);


  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const { user } = useAuth();

  // -------------------- Load Assets --------------------
  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const backendData: BackendAsset[] = await getAssetHierarchy();
      setAssets(normalizeAssets(backendData));
    } catch (err: any) {
      console.error("Failed to load assets:", err);

      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load assets. Please try again.";

      toast.error(message, { autoClose: 4000 });
    } finally {
      setLoading(false);
    }
  };

  // -------------------- Assign Device --------------------
  const onAssignDevice = () => {
    if (!selectedAsset) return;
    setShowAssignDevice(true);
  };


  const isAdmin = user?.role === "Admin";

  return (
    <div className="p-3 relative">
      {/* Global Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70">
          <Spinner />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Asset Hierarchy
          </h1>
          <p className="text-sm text-muted-foreground">
            Explore structure of plants, departments, machines & sub-machines.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-4">
            <Bot
            onClick={()=>navigate('/ai')}
              className="
    w-9 h-9
    p-1.5
    rounded-xl
    border border-neutral-300
    bg-white
    shadow-sm
    text-neutral-700
    hover:shadow-md
    transition-all
    duration-200
    scale-110
    cursor-pointer
  "
            />
            <Button
              id="import-bulk-btn"
              onClick={() => navigate("/Asset/BulkUpload")}
            >
              Import Bulk
            </Button>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-1 mt-6">
        {/* Asset Tree */}
        <div id="asset-tree" className="col-span-12 xl:col-span-5">
          <Card className="h-[550px] flex flex-col ">
            <CardContent className="p-2 flex-1 overflow-auto">
              {!loading && (
                <AssetTree
                  assets={assets}
                  selectedId={selectedAsset?.assetId ?? null}
                  onSelect={setSelectedAsset}
                  onDelete={(deletedAsset) => {
                    setAssets(prev => removeAssetById(prev, deletedAsset.assetId));
                  }}
                  onAdd={() => {
                    loadAssets(); // refresh from backend
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Asset Details */}
        <div id="asset-details" className="col-span-12 xl:col-span-7">
          <Card className="h-[550px] flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Asset Details</CardTitle>
            </CardHeader>

            <CardContent className="p-2 flex-1 overflow-auto">
              {!loading && (
                <AssetDetails
                  selectedAsset={selectedAsset}
                  assignedDevice={assignedDevice}
                  onRestore={() => { }}
                  onAssignDevice={onAssignDevice}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      

      {/* Assign Device Modal */}
      {showAssignDevice && selectedAsset && (
        <AssignDevice
          open={showAssignDevice}
          asset={selectedAsset}
          onClose={() => setShowAssignDevice(false)}
          onAssign={(device) => {
            setAssignedDevice(device);
            setShowAssignDevice(false);
            toast.success("✅ Device assigned successfully");
          }}
        />
      )}

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
      <DialogContent className="sm:max-w-md p-6 bg-card rounded-2xl border shadow-xl">
        <DialogHeader>
          <DialogTitle>Upload CSV</DialogTitle>
          <DialogDescription>Upload asset hierarchy file</DialogDescription>
        </DialogHeader>

        <UploadAssetCsv 
          onClose={() => setShowUploadModal(false)}
          onSuccess={(file) => {
            console.log("File received:", file);
            loadAssets();
            setShowUploadModal(false);
          }}
        />
      </DialogContent>
    </Dialog>

    </div>
  );
}
