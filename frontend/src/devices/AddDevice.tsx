import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createDevice } from "@/api/deviceApi";
import { getGateways, type Gateway } from "@/api/GatewayApi";
import { toast } from "react-toastify";

export default function AddDeviceForm() {
  const navigate = useNavigate();

  /* =======================
     State
  ======================= */

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    gatewayClientId: "",
  });

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGateways, setLoadingGateways] = useState(true);

  /* =======================
     Fetch Gateways
  ======================= */
  useEffect(() => {
    const fetchGateways = async () => {
      try {
        const data = await getGateways();
        setGateways(data);
      } catch (error) {
        toast.error("Failed to load gateways");
      } finally {
        setLoadingGateways(false);
      }
    };

    fetchGateways();
  }, []);

  /* =======================
     Validation
  ======================= */
  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error("Device Name is required.");
      return false;
    }

    if (!formData.gatewayClientId) {
      toast.error("Please select a Gateway.");
      return false;
    }

    if (formData.description.length > 255) {
      toast.error("Description must be less than 255 characters.");
      return false;
    }

    return true;
  };

  /* =======================
     Handlers
  ======================= */
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        gatewayClientId: formData.gatewayClientId,
      };

      await createDevice(payload);

      toast.success("Device created successfully!");
      navigate("/devices");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "Failed to create device"
      );
    } finally {
      setLoading(false);
    }
  };

  /* =======================
     UI
  ======================= */
  return (
    <div className="flex justify-center items-center min-h-[80vh]">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Add New Device</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Device Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Device Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Gateway Dropdown */}
            <div className="grid gap-2">
              <Label htmlFor="gatewayClientId">Gateway *</Label>
              <select
                id="gatewayClientId"
                name="gatewayClientId"
                value={formData.gatewayClientId}
                onChange={handleChange}
                disabled={loadingGateways}
                className="border rounded-md p-2"
                required
              >
                <option value="">
                  {loadingGateways
                    ? "Loading gateways..."
                    : "Select Gateway"}
                </option>

                {gateways.map((gateway) => (
                  <option
                    key={gateway.clientId}
                    value={gateway.clientId}
                  >
                    {gateway.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/devices")}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Device"}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
