export interface AdeToken {
  id: string;
  server_name?: string;
  access_token_expiry?: string;
  days_left?: number;
  device_count?: number;
  blueprint_id?: string;
  blueprint_name?: string;
  email?: string;
  phone?: string;
  last_device_sync?: string;
}

export interface AdeDevice {
  device_id: string;
  name?: string;
  serial_number?: string;
  model?: string;
  device_family?: string;
  os?: string;
  profile_status?: string;
  asset_tag?: string;
  description?: string;
  blueprint_id?: string;
  user?: string;
  color?: string;
}

export interface Blueprint {
  id: string;
  name: string;
}

export interface Credentials {
  subdomain: string;
  region: string;
}

export interface HealthResult {
  ok: boolean;
  error?: string;
}
