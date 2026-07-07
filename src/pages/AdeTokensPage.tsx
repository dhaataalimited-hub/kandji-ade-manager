import { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { AdeEditDialog } from "../components/AdeEditDialog";
import { AdeTokenUploadDialog } from "../components/AdeTokenUploadDialog";
import { formatDate, formatRelativeDate, shortenUuid } from "../lib/utils";
import type { AdeToken, AdeDevice, Blueprint } from "../lib/types";
import {
  listAdeTokens,
  listAdeTokenDevices,
  getBlueprints,
  deleteAdeToken,
} from "../api/kandji";
import {
  Key,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Loader2,
  Calendar,
  Monitor,
  Plus,
  Trash2,
} from "lucide-react";

interface TokenWithDevices extends AdeToken {
  expanded: boolean;
  devices: AdeDevice[] | null;
  devicesLoading: boolean;
}

function expiryBadge(daysLeft?: number) {
  if (daysLeft === undefined || daysLeft === null) return null;
  if (daysLeft <= 0)
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">Expired</Badge>
    );
  if (daysLeft <= 30)
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        {daysLeft}d left
      </Badge>
    );
  if (daysLeft <= 90)
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
        {daysLeft}d left
      </Badge>
    );
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200">
      {daysLeft}d left
    </Badge>
  );
}

function resolveBlueprintName(
  blueprintId: string | undefined,
  blueprintMap: Map<string, string>
): string {
  if (!blueprintId) return "—";
  return blueprintMap.get(blueprintId) ?? shortenUuid(blueprintId);
}

export default function AdeTokensPage() {
  const [tokens, setTokens] = useState<TokenWithDevices[]>([]);
  const [blueprintMap, setBlueprintMap] = useState<Map<string, string>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDevice, setEditDevice] = useState<AdeDevice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const loadTokens = () => {
    setLoading(true);
    setError(null);
    listAdeTokens()
      .then((data) => {
        setTokens(
          data.map((t) => ({
            ...t,
            expanded: false,
            devices: null,
            devicesLoading: false,
          }))
        );
      })
      .catch((e: unknown) =>
        setError(typeof e === "string" ? e : (e as Error).message)
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTokens();
    getBlueprints()
      .then((data: Blueprint[]) => {
        setBlueprintMap(new Map(data.map((b) => [b.id, b.name])));
      })
      .catch(() => {});
  }, []);

  const toggleToken = async (idx: number) => {
    const token = tokens[idx];
    if (token.expanded) {
      setTokens((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, expanded: false } : t))
      );
      return;
    }
    if (token.devices !== null) {
      setTokens((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, expanded: true } : t))
      );
      return;
    }
    setTokens((prev) =>
      prev.map((t, i) =>
        i === idx ? { ...t, expanded: true, devicesLoading: true } : t
      )
    );
    try {
      const data = await listAdeTokenDevices(token.id);
      setTokens((prev) =>
        prev.map((t, i) =>
          i === idx
            ? {
                ...t,
                devices: Array.isArray(data) ? data : [],
                devicesLoading: false,
              }
            : t
        )
      );
    } catch {
      setTokens((prev) =>
        prev.map((t, i) =>
          i === idx ? { ...t, devices: [], devicesLoading: false } : t
        )
      );
    }
  };

  const handleDeleteToken = async (token: TokenWithDevices) => {
    const name = token.server_name ?? token.id;
    const confirmed = await ask(
      `Are you sure you want to remove the ADE token "${name}"?\n\nThis will delete the integration from Iru. Enrolled devices will not be affected.`,
      { title: "Remove ADE Token", kind: "warning" }
    );
    if (!confirmed) return;

    setDeletingId(token.id);
    try {
      await deleteAdeToken(token.id);
      setTokens((prev) => prev.filter((t) => t.id !== token.id));
    } catch (e: unknown) {
      alert(
        "Failed to delete token: " +
          (typeof e === "string" ? e : (e as Error).message)
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeviceSaved = (updated: AdeDevice) => {
    setTokens((prev) =>
      prev.map((t) => ({
        ...t,
        devices: t.devices
          ? t.devices.map((d) =>
              d.device_id === updated.device_id ? updated : d
            )
          : t.devices,
      }))
    );
    setEditDevice(null);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-8 h-8 text-red-500" />
        <p className="text-sm text-gray-500 max-w-md text-center">{error}</p>
        <Button variant="outline" onClick={loadTokens}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {loading
            ? "Loading…"
            : `${tokens.length} integration${tokens.length !== 1 ? "s" : ""} configured`}
        </p>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add ADE Token
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-5 bg-gray-200 rounded w-48" />
                <div className="h-3 bg-gray-100 rounded w-32" />
              </div>
            </Card>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <Key className="w-10 h-10 text-gray-400" />
          <div>
            <p className="font-medium text-gray-900">No ADE tokens found</p>
            <p className="text-sm text-gray-500 mt-1">
              Upload an MDM server token from Apple Business Manager to get
              started.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add ADE Token
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {tokens.map((token, idx) => (
            <Card key={token.id} className="overflow-hidden">
              {/* ── Token header row ── */}
              <div
                className="flex items-center gap-4 p-5 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                onClick={() => toggleToken(idx)}
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 shrink-0">
                  <Key className="w-5 h-5 text-blue-600" />
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">
                      {token.server_name ?? token.id}
                    </h3>
                    {expiryBadge(token.days_left)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Monitor className="w-3 h-3" />
                      {token.device_count ?? 0} devices
                    </span>
                    {token.last_device_sync && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <RefreshCw className="w-3 h-3" />
                        Last sync {formatRelativeDate(token.last_device_sync)}
                      </span>
                    )}
                    {token.access_token_expiry && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        Expires {formatDate(token.access_token_expiry)}
                      </span>
                    )}
                    {token.blueprint_id && (
                      <span className="text-xs text-gray-500">
                        Blueprint:{" "}
                        <span className="font-medium text-gray-700">
                          {blueprintMap.get(token.blueprint_id) ??
                            shortenUuid(token.blueprint_id)}
                        </span>
                      </span>
                    )}
                    {token.email && (
                      <span className="text-xs text-gray-500">
                        {token.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRenewTarget({
                        id: token.id,
                        name: token.server_name ?? token.id,
                      })
                    }
                    className={
                      token.days_left !== undefined && token.days_left <= 90
                        ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                        : ""
                    }
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Renew
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteToken(token)}
                    disabled={deletingId === token.id}
                    className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    {deletingId === token.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>

                {token.expanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>

              {/* ── Expanded devices table ── */}
              {token.expanded && (
                <div className="border-t border-gray-100">
                  {token.devicesLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading devices…
                    </div>
                  ) : token.devices && token.devices.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            {[
                              "Serial",
                              "Model",
                              "Asset Tag",
                              "User",
                              "Blueprint",
                              "",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {token.devices.map((device) => (
                            <tr
                              key={device.device_id}
                              className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs text-gray-500">
                                  {device.serial_number}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {device.model ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {device.asset_tag || "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {device.user || "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {resolveBlueprintName(
                                  device.blueprint_id,
                                  blueprintMap
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditDevice(device)}
                                  className="text-gray-400 hover:text-gray-700"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-sm text-gray-400">
                      No devices found for this ADE token.
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AdeTokenUploadDialog
        mode="add"
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={loadTokens}
      />

      <AdeTokenUploadDialog
        mode="renew"
        tokenId={renewTarget?.id}
        tokenName={renewTarget?.name}
        open={renewTarget !== null}
        onClose={() => setRenewTarget(null)}
        onSuccess={() => {
          setRenewTarget(null);
          loadTokens();
        }}
      />

      <AdeEditDialog
        device={editDevice}
        open={editDevice !== null}
        onClose={() => setEditDevice(null)}
        onSaved={handleDeviceSaved}
      />
    </>
  );
}
