import { invoke } from "@tauri-apps/api/core";
import type {
  AdeToken,
  AdeDevice,
  AdeDevicePage,
  Blueprint,
  Credentials,
  HealthResult,
} from "../lib/types";

// ─── Credentials ─────────────────────────────────────────────────────────────

export function loadCredentials(): Promise<Credentials | null> {
  return invoke<Credentials | null>("load_credentials");
}

export function saveCredentials(
  subdomain: string,
  token: string,
  region: string
): Promise<void> {
  return invoke("save_credentials", { subdomain, token, region });
}

export function clearCredentials(): Promise<void> {
  return invoke("clear_credentials");
}

// ─── Health ───────────────────────────────────────────────────────────────────

export function checkConnection(
  subdomain: string,
  token: string,
  region: string
): Promise<HealthResult> {
  return invoke<HealthResult>("check_connection", { subdomain, token, region });
}

// ─── ADE tokens ──────────────────────────────────────────────────────────────

export function listAdeTokens(): Promise<AdeToken[]> {
  return invoke<AdeToken[]>("list_ade_tokens");
}

export function downloadAdePublicKey(): Promise<string> {
  return invoke<string>("download_ade_public_key");
}

export function uploadAdeToken(
  fileBytes: number[],
  filename: string,
  blueprintId?: string,
  phone?: string,
  email?: string
): Promise<AdeToken> {
  return invoke<AdeToken>("upload_ade_token", {
    fileBytes,
    filename,
    blueprintId,
    phone,
    email,
  });
}

export function renewAdeToken(
  adeId: string,
  fileBytes: number[],
  filename: string,
  blueprintId?: string,
  phone?: string,
  email?: string
): Promise<AdeToken> {
  return invoke<AdeToken>("renew_ade_token", {
    adeId,
    fileBytes,
    filename,
    blueprintId,
    phone,
    email,
  });
}

export function listAdeTokenDevices(
  adeId: string,
  page: number
): Promise<AdeDevicePage> {
  return invoke<AdeDevicePage>("list_ade_token_devices", { adeId, page });
}

export function getBlueprints(): Promise<Blueprint[]> {
  return invoke<Blueprint[]>("get_blueprints");
}

export function updateAdeDevice(
  deviceId: string,
  payload: { blueprintId?: string; assetTag?: string; user?: string }
): Promise<AdeDevice> {
  return invoke<AdeDevice>("update_ade_device", {
    deviceId,
    blueprintId: payload.blueprintId,
    assetTag: payload.assetTag,
    user: payload.user,
  });
}

export function deleteAdeToken(adeId: string): Promise<void> {
  return invoke("delete_ade_token", { adeId });
}
