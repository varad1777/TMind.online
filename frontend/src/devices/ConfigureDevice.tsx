import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Settings2, ArrowLeft } from "lucide-react";
import { getDeviceById, updateDevice } from "@/api/deviceApi";
import { toast } from "react-toastify";

export default function ConfigureDevice() {
  const navigate = useNavigate();
  const { deviceId } = useParams<{ deviceId: string }>();
  const [loading, setLoading] = useState(false);

  const [deviceDetails, setDeviceDetails] = useState({
    name: "",
    description: "",
    gatewayClientId: "",
  });

  const [formData, setFormData] = useState({
    configName: "",
    pollInterval: 1000,
    protocolSettings: {
      IpAddress: "127.0.0.1",
      Port: 5020,
      SlaveId: 1,
      Endian: "Little",
    },
  });

  /* ===========================
     FETCH DEVICE
  ============================ */
  useEffect(() => {
    if (!deviceId) return;

    const fetchDevice = async () => {
      try {
        const res = await getDeviceById(deviceId);

        setDeviceDetails({
          name: res.name ?? "",
          description: res.description ?? "",
          gatewayClientId: res.gatewayClientId ?? "",
        });

        let protocolSettings = {
          IpAddress: "127.0.0.1",
          Port: 5020,
          SlaveId: 1,
          Endian: "Little",
        };

        try {
          if (res.configuration?.protocolSettingsJson) {
            protocolSettings = JSON.parse(
              res.configuration.protocolSettingsJson
            );
          }
        } catch (err) {
          console.error("Invalid protocolSettingsJson", err);
        }

        setFormData({
          configName:
            res.configuration?.name ?? `${res.name}_config`,
          pollInterval:
            res.configuration?.pollIntervalMs ?? 1000,
          protocolSettings,
        });
      } catch (error: any) {
        toast.error("Failed to load device");
        navigate("/devices");
      }
    };

    fetchDevice();
  }, [deviceId, navigate]);

  /* ===========================
     HANDLERS
  ============================ */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === "pollInterval" ? Number(value) : value,
    }));
  };

  const handleProtocolChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      protocolSettings: {
        ...prev.protocolSettings,
        [name]:
          name === "Port" || name === "SlaveId"
            ? Number(value)
            : value,
      },
    }));
  };

  /* ===========================
     VALIDATION
  ============================ */
  const validateForm = () => {
    const { configName, pollInterval, protocolSettings } = formData;
    const { IpAddress, Port, SlaveId } = protocolSettings;

    if (!configName.trim()) {
      toast.error("Configuration name is required");
      return false;
    }

    if (pollInterval < 100 || pollInterval > 300000) {
      toast.error("Poll interval must be 100–300000 ms");
      return false;
    }

    const ipRegex =
      /^(25[0-5]|2[0-4]\d|1?\d{1,2})(\.(25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/;

    if (!ipRegex.test(IpAddress)) {
      toast.error("Invalid IP Address");
      return false;
    }

    if (Port < 1 || Port > 65535) {
      toast.error("Port must be 1–65535");
      return false;
    }

    if (SlaveId < 1 || SlaveId > 247) {
      toast.error("Slave ID must be 1–247");
      return false;
    }

    return true;
  };

  /* ===========================
     SUBMIT
  ============================ */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId) return;

    if (!validateForm()) return;

    setLoading(true);

    try {
      await updateDevice(
        deviceId,
        {
          name: deviceDetails.name,
          description: deviceDetails.description,
          gatewayClientId: deviceDetails.gatewayClientId,
        },
        {
          name: formData.configName,
          pollIntervalMs: formData.pollInterval,
          protocolSettingsJson: JSON.stringify(
            formData.protocolSettings
          ),
        }
      );

      toast.success("Device configured successfully");
      navigate("/devices");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ??
          "Failed to update device"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ===========================
     UI
  ============================ */
  return (
    <div className="flex justify-center items-center min-h-[80vh] p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex flex-row items-center gap-2">
          <Settings2 className="h-5 w-5" />
          <CardTitle>Configure Device</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label>Configuration Name</Label>
              <Input
                name="configName"
                value={formData.configName}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label>Poll Interval (ms)</Label>
              <Input
                name="pollInterval"
                type="number"
                value={formData.pollInterval}
                onChange={handleChange}
              />
            </div>

            <hr />

            <p className="text-sm font-semibold">
              Protocol Settings
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>IP Address</Label>
                <Input
                  name="IpAddress"
                  value={formData.protocolSettings.IpAddress}
                  onChange={handleProtocolChange}
                />
              </div>

              <div>
                <Label>Port</Label>
                <Input
                  name="Port"
                  type="number"
                  value={formData.protocolSettings.Port}
                  onChange={handleProtocolChange}
                />
              </div>

              <div>
                <Label>Slave ID</Label>
                <Input
                  name="SlaveId"
                  type="number"
                  value={formData.protocolSettings.SlaveId}
                  onChange={handleProtocolChange}
                />
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/devices")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
