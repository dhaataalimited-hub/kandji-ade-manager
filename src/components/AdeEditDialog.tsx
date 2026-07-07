import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { updateAdeDevice, getBlueprints } from "../api/kandji";
import type { AdeDevice, Blueprint } from "../lib/types";
import { Loader2 } from "lucide-react";

interface Props {
  device: AdeDevice | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: AdeDevice) => void;
}

export function AdeEditDialog({ device, open, onClose, onSaved }: Props) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [blueprintId, setBlueprintId] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBlueprintId(device?.blueprint_id ?? "");
    setAssetTag(device?.asset_tag ?? "");
    setError(null);
    getBlueprints()
      .then((d) => setBlueprints(d))
      .catch(() => {});
  }, [open, device]);

  const handleSave = async () => {
    if (!device) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdeDevice(device.device_id, {
        blueprintId: blueprintId || undefined,
        assetTag: assetTag || undefined,
      });
      onSaved(updated);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Device</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-500 font-mono">{device?.serial_number}</p>

          <div className="space-y-1">
            <Label className="text-xs">Blueprint</Label>
            <select
              className="h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={blueprintId}
              onChange={(e) => setBlueprintId(e.target.value)}
            >
              <option value="">— No change —</option>
              {blueprints.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Asset Tag</Label>
            <Input
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              placeholder="e.g. IT-0042"
              className="h-9 text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
