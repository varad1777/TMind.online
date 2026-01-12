import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "react-toastify";
import { insertAsset } from "@/api/assetApi";

interface AddRootProps {
  onClose: () => void;
  onAdd?: () => void;
}

export default function AddRoot({ onClose, onAdd }: AddRootProps) {
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [touched, setTouched] = useState(false);


  const validateName = (value: string) => {
    const trimmed = value.trim();
    const regex = /^[A-Za-z][A-Za-z0-9_\- ]{2,99}$/;

    if (!trimmed) {
      setErrorMsg("Asset name is required.");
      return false;
    }
    if (!regex.test(trimmed)) {
      setErrorMsg(
        "Must start with a letter, 3–100 chars, allowed: letters, numbers, space, _ , -"
      );
      return false;
    }

    setErrorMsg("");
    return true;
  };

  useEffect(() => {
    setIsValid(validateName(name));
  }, [name]);

  const handleAdd = async () => {
    setTouched(true);
    if (!isValid) return;

    setLoading(true);
    try {
      const payload = {
        parentId: null,
        name: name.trim(),
        level: 0,
      };

      const response = await insertAsset(payload);
      toast.success(`Root asset "${payload.name}" added successfully!`);

      if (onAdd) onAdd();
      setTimeout(() => onClose(), 700);
    } catch (err: any) {
      toast.error(err || "Failed to create asset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[999] bg-black/30 backdrop-blur-sm">
      <div className="w-[400px] max-h-[80vh] overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-left">
              Add Root Asset
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-4 w-full">
              <div className="grid gap-2">
                <Label htmlFor="name">Asset Name *</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter root asset name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)} 
                />

                {/* 🔥 LIVE VALIDATION MESSAGE */}
                {touched && errorMsg && (
                  <p className="text-red-500 text-sm mt-1">{errorMsg}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>

                <Button onClick={handleAdd} disabled={!isValid || loading}>
                  {loading ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
