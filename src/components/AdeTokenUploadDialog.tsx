import { useCallback, useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  downloadAdePublicKey,
  uploadAdeToken,
  renewAdeToken,
  getBlueprints,
} from "../api/kandji";
import type { Blueprint } from "../lib/types";
import {
  Loader2,
  CheckCircle2,
  UploadCloud,
  FileKey,
  X,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Download,
} from "lucide-react";

// ─── Shared: drag-and-drop .p7m file picker ──────────────────────────────────

function FileDropZone({
  file,
  onFile,
  onClear,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-7 cursor-pointer transition-colors ${
        dragging
          ? "border-blue-400 bg-blue-50"
          : file
            ? "border-emerald-300 bg-emerald-50"
            : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".p7m,.pem,.cer"
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {file ? (
        <>
          <FileKey className="w-7 h-7 text-emerald-600" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {(file.size / 1024).toFixed(1)} KB · ready to upload
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:bg-gray-100"
            title="Remove file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <UploadCloud className="w-7 h-7 text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              {dragging ? "Drop file here" : "Drop .p7m file or click to browse"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Accepts .p7m</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared: blueprint / phone / email fields (required by the API) ───────────

interface TokenSettings {
  blueprintId: string;
  phone: string;
  email: string;
}

function SettingsSection({
  fields,
  onChange,
}: {
  fields: TokenSettings;
  onChange: (f: TokenSettings) => void;
}) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);

  useEffect(() => {
    getBlueprints()
      .then((d) => setBlueprints(d))
      .catch(() => {});
  }, []);

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 select-none">Settings</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Blueprint</Label>
          <select
            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={fields.blueprintId}
            onChange={(e) =>
              onChange({ ...fields, blueprintId: e.target.value })
            }
          >
            <option value="">— Select a Blueprint —</option>
            {blueprints.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {fields.blueprintId && (
            <p className="text-[10px] text-gray-400 font-mono truncate">
              {fields.blueprintId}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input
            placeholder="+1 555 000 0000"
            value={fields.phone}
            onChange={(e) => onChange({ ...fields, phone: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input
            placeholder="admin@company.com"
            value={fields.email}
            onChange={(e) => onChange({ ...fields, email: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Shared: step indicator ───────────────────────────────────────────────────

function StepIndicator({
  current,
  labels,
}: {
  current: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center mb-6">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                i < current
                  ? "bg-blue-600 text-white"
                  : i === current
                    ? "border-2 border-blue-600 text-blue-600 bg-blue-50"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {i < current ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-xs font-medium hidden sm:block ${
                i === current ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div
              className={`flex-1 h-px mx-3 ${i < current ? "bg-blue-600" : "bg-gray-200"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── ABM checklist row ────────────────────────────────────────────────────────

function AbmStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="text-xs text-gray-700 leading-relaxed">{children}</span>
    </div>
  );
}

// ─── Read a File as number[] for Tauri invoke ─────────────────────────────────

async function readFileAsBytes(file: File): Promise<number[]> {
  const buf = await file.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}

// ─── Add New ADE Token ────────────────────────────────────────────────────────

function AddNewTokenWizard({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(0);
  const [pemDownloading, setPemDownloading] = useState(false);
  const [pemDownloaded, setPemDownloaded] = useState(false);
  const [pemError, setPemError] = useState<string | null>(null);
  const [p7mFile, setP7mFile] = useState<File | null>(null);
  const [fields, setFields] = useState<TokenSettings>({
    blueprintId: "",
    phone: "",
    email: "",
  });
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadPublicKey = async () => {
    setPemDownloading(true);
    setPemError(null);
    try {
      const pem = await downloadAdePublicKey();
      // Open native Save dialog so user chooses where to save
      const savePath = await save({
        defaultPath: "iru-ade-public-key.pem",
        filters: [{ name: "PEM Certificate", extensions: ["pem"] }],
      });
      if (savePath) {
        await writeTextFile(savePath, pem);
        setPemDownloaded(true);
      }
    } catch (e: unknown) {
      setPemError(typeof e === "string" ? e : (e as Error).message);
    } finally {
      setPemDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!p7mFile) return;
    setUploading(true);
    setError(null);
    try {
      const fileBytes = await readFileAsBytes(p7mFile);
      await uploadAdeToken(
        fileBytes,
        p7mFile.name,
        fields.blueprintId || undefined,
        fields.phone || undefined,
        fields.email || undefined
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1600);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <StepIndicator
        current={step}
        labels={["Set up in ABM", "Upload token"]}
      />

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            To add a new ADE integration, Iru needs to be registered as an
            MDM server in Apple Business Manager. Start by downloading
            Iru&apos;s public key, then follow the steps in ABM.
          </p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Step 1 — Download Iru public key
              </p>
            </div>
            <div className="px-3 py-3 space-y-3">
              <p className="text-xs text-gray-500">
                This downloads the unique{" "}
                <code className="bg-gray-100 px-1 rounded">.pem</code>{" "}
                certificate for your Iru tenant directly from the API.
              </p>
              <Button
                onClick={handleDownloadPublicKey}
                disabled={pemDownloading}
                variant={pemDownloaded ? "outline" : "default"}
                className="w-full"
              >
                {pemDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Downloading…
                  </>
                ) : pemDownloaded ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />
                    Downloaded — click to download again
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Public Key (.pem)
                  </>
                )}
              </Button>
              {pemDownloaded && (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <strong>iru-ade-public-key.pem</strong> saved
                </p>
              )}
              {pemError && (
                <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                  {pemError}
                </p>
              )}
            </div>
          </div>

          <div
            className={`rounded-lg border overflow-hidden transition-opacity ${
              pemDownloaded
                ? "border-gray-200 opacity-100"
                : "border-gray-200 opacity-50"
            }`}
          >
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Step 2 — Create MDM server in Apple Business Manager
              </p>
            </div>
            <AbmStep n={1}>
              Sign in to{" "}
              <a
                href="https://business.apple.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
              >
                business.apple.com{" "}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </AbmStep>
            <AbmStep n={2}>
              Go to <strong>Settings → MDM Servers</strong> and click{" "}
              <strong>&quot;Add MDM Server&quot;</strong>
            </AbmStep>
            <AbmStep n={3}>
              Give the server a name, then upload the{" "}
              <code className="bg-gray-100 px-1 rounded">.pem</code> file you
              just saved
            </AbmStep>
            <AbmStep n={4}>
              Click <strong>&quot;Save&quot;</strong>, then click{" "}
              <strong>&quot;Download MDM Server Token&quot;</strong> to get the{" "}
              <code className="bg-gray-100 px-1 rounded">.p7m</code> file
            </AbmStep>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload the{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
              .p7m
            </code>{" "}
            token you downloaded from Apple Business Manager.
          </p>

          {success ? (
            <div className="flex items-center justify-center gap-2 text-emerald-600 py-8">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">
                ADE integration added successfully!
              </span>
            </div>
          ) : (
            <>
              <FileDropZone
                file={p7mFile}
                onFile={setP7mFile}
                onClear={() => setP7mFile(null)}
              />
              <SettingsSection fields={fields} onChange={setFields} />
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 whitespace-pre-wrap break-words">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <DialogFooter className="mt-6 gap-2">
        <Button variant="outline" onClick={onClose} disabled={uploading}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step === 0 ? (
          <Button onClick={() => setStep(1)} disabled={!pemDownloaded}>
            I have my .p7m{" "}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        ) : (
          <Button
            onClick={handleUpload}
            disabled={!p7mFile || uploading || success}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              "Add Integration"
            )}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ─── Renew ADE Token ──────────────────────────────────────────────────────────

function RenewTokenWizard({
  tokenId,
  tokenName,
  initialBlueprintId = "",
  initialPhone = "",
  initialEmail = "",
  onClose,
  onSuccess,
}: {
  tokenId: string;
  tokenName: string;
  initialBlueprintId?: string;
  initialPhone?: string;
  initialEmail?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(0);
  const [p7mFile, setP7mFile] = useState<File | null>(null);
  const [fields, setFields] = useState<TokenSettings>({
    blueprintId: initialBlueprintId,
    phone: initialPhone,
    email: initialEmail,
  });
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!p7mFile) return;
    setUploading(true);
    setError(null);
    try {
      const fileBytes = await readFileAsBytes(p7mFile);
      await renewAdeToken(
        tokenId,
        fileBytes,
        p7mFile.name,
        fields.blueprintId || undefined,
        fields.phone || undefined,
        fields.email || undefined
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1600);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <StepIndicator
        current={step}
        labels={["Get token from ABM", "Upload & renew"]}
      />

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Download a fresh server token for{" "}
            <strong>{tokenName}</strong> from Apple Business Manager. No new
            public key is needed — the existing MDM server registration stays in
            place.
          </p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <AbmStep n={1}>
              Sign in to{" "}
              <a
                href="https://business.apple.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
              >
                business.apple.com{" "}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </AbmStep>
            <AbmStep n={2}>
              Go to <strong>Settings → MDM Servers</strong>
            </AbmStep>
            <AbmStep n={3}>
              Find the server named{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                {tokenName}
              </code>
            </AbmStep>
            <AbmStep n={4}>
              Click{" "}
              <strong>&quot;Download MDM Server Token&quot;</strong> to get a
              new{" "}
              <code className="bg-gray-100 px-1 rounded">.p7m</code> file
            </AbmStep>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
            <span className="shrink-0 mt-0.5">ℹ️</span>
            Each download from ABM generates a one-time-use token — upload it
            here promptly and don&apos;t share it.
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload the{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
              .p7m
            </code>{" "}
            you just downloaded from ABM. The expiry will reset to ~365 days.
          </p>

          {success ? (
            <div className="flex items-center justify-center gap-2 text-emerald-600 py-8">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">
                Token renewed — 365 days remaining!
              </span>
            </div>
          ) : (
            <>
              <FileDropZone
                file={p7mFile}
                onFile={setP7mFile}
                onClear={() => setP7mFile(null)}
              />
              <SettingsSection fields={fields} onChange={setFields} />
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 whitespace-pre-wrap break-words">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <DialogFooter className="mt-6 gap-2">
        <Button
          variant="outline"
          onClick={step === 0 ? onClose : () => setStep(0)}
          disabled={uploading}
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step === 0 ? (
          <Button onClick={() => setStep(1)}>
            I have my .p7m{" "}
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        ) : (
          <Button
            onClick={handleUpload}
            disabled={!p7mFile || uploading || success}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Renewing…
              </>
            ) : (
              "Renew Token"
            )}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface AdeTokenUploadDialogProps {
  mode: "add" | "renew";
  tokenId?: string;
  tokenName?: string;
  initialBlueprintId?: string;
  initialPhone?: string;
  initialEmail?: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdeTokenUploadDialog({
  mode,
  tokenId,
  tokenName,
  initialBlueprintId,
  initialPhone,
  initialEmail,
  open,
  onClose,
  onSuccess,
}: AdeTokenUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "renew" ? (
              <>
                <RefreshCw className="w-4 h-4 text-blue-600" />
                Renew ADE Token
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 text-blue-600" />
                Add New ADE Token
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "renew" ? (
              <>
                Renew the Apple Business Manager integration for{" "}
                <strong>{tokenName}</strong>.
              </>
            ) : (
              "Connect a new Apple Business Manager MDM server to this Iru tenant."
            )}
          </DialogDescription>
        </DialogHeader>

        {mode === "add" ? (
          <AddNewTokenWizard onClose={onClose} onSuccess={onSuccess} />
        ) : (
          <RenewTokenWizard
            tokenId={tokenId!}
            tokenName={tokenName!}
            initialBlueprintId={initialBlueprintId}
            initialPhone={initialPhone}
            initialEmail={initialEmail}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
