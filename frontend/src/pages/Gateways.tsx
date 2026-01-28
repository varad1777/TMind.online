import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  Loader2,
  Copy,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "react-toastify";
import { getGateways, addGateway, searchGateways } from "@/api/GatewayApi";
import { Spinner } from "@/components/ui/spinner";

interface Gateway {
  name: string;
  clientId: string;
}

interface GatewayCredentials {
  clientId: string;
  clientSecret: string;
}

export default function Gateways() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  // Add Gateway Dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [gatewayName, setGatewayName] = useState("");
  const [saving, setSaving] = useState(false);

  // Credentials Dialog - NEW
  const [openCredentialsDialog, setOpenCredentialsDialog] = useState(false);
  const [credentials, setCredentials] = useState<GatewayCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch gateways
  useEffect(() => {
    const fetchGateways = async () => {
      try {
        setLoading(true);
        const data = await getGateways();
        setGateways(data);
      } catch (err) {
        setError("Failed to fetch gateways");
      } finally {
        setLoading(false);      
      }
    };

    fetchGateways();
  }, [debouncedSearch]);

  // Add gateway - UPDATED
  const handleAddGateway = async () => {
    if (!gatewayName.trim()) {
      toast.error("Gateway name is required");
      return;
    }                                                               

    try {
      setSaving(true);
      const res = await addGateway(gatewayName.trim());

      toast.success("Gateway added successfully");

      // Store credentials and show dialog
      setCredentials({
        clientId: res.clientId,
        clientSecret: res.clientSecret
      });
      setOpenCredentialsDialog(true);

      setGatewayName("");
      setOpenDialog(false);

      // Refresh list
      const updated = await getGateways();
      setGateways(updated);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
        err?.response?.data ||
        "Failed to add gateway"
      );
    } finally {
      setSaving(false);
    }
  };

  // Copy to clipboard - NEW
  const handleCopy = async () => {
    if (credentials?.clientSecret) {
      try {
        await navigator.clipboard.writeText(credentials.clientSecret);
        setCopied(true);
        toast.success("Client secret copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast.error("Failed to copy to clipboard");
      }
    }
  };

  // Reset copied state when dialog closes - NEW
  const handleCloseCredentialsDialog = () => {
    setOpenCredentialsDialog(false);
    setCopied(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gateways</h1>
          <p className="text-muted-foreground">
            Manage registered gateways
          </p>
        </div>

        <Button onClick={() => setOpenDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Gateway
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-1/3">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search gateways..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border rounded-md"
        />
      </div>

      {/* Content */}
      {loading && <Spinner />}
      {error && <p className="text-destructive">{error}</p>}

      {!loading && !error && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-4 text-left">Gateway Name</th>
                <th className="p-4 text-left">Client ID</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((g) => (
                <tr key={g.clientId} className="border-t">
                  <td className="p-4 font-medium">{g.name}</td>
                  <td className="p-4 text-muted-foreground">
                    {g.clientId}
                  </td>
                </tr>
              ))}

              {gateways.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="text-center p-6 text-muted-foreground"
                  >
                    No gateways found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Gateway Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Gateway</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <label className="text-sm font-medium">
              Gateway Name
            </label>
            <Input
              placeholder="Enter gateway name"
              value={gatewayName}
              onChange={(e) => setGatewayName(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button onClick={handleAddGateway} disabled={saving}>
              {saving && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog - NEW */}
      <Dialog open={openCredentialsDialog} onOpenChange={handleCloseCredentialsDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gateway Credentials</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ Important: Save these credentials now
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                The client secret will only be shown once and cannot be retrieved later.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Client ID
              </label>
              <div className="p-3 bg-gray-50 border rounded-md font-mono text-sm break-all">
                {credentials?.clientId}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Client Secret
              </label>
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-gray-50 border rounded-md font-mono text-sm break-all">
                  {credentials?.clientSecret}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleCloseCredentialsDialog}>
              I've Saved the Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}