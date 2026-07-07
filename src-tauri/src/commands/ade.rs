use crate::commands::credentials::{get_stored_creds, get_stored_token};
use crate::http_client::{build_client, get_base_url};
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ─── Data types (mirror the TypeScript interfaces) ───────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdeToken {
    pub id: String,
    pub server_name: Option<String>,
    pub access_token_expiry: Option<String>,
    pub days_left: Option<i64>,
    pub device_count: Option<i64>,
    pub blueprint_id: Option<String>,
    pub blueprint_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub last_device_sync: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdeDevice {
    pub device_id: String,
    pub name: Option<String>,
    pub serial_number: Option<String>,
    pub model: Option<String>,
    pub device_family: Option<String>,
    pub os: Option<String>,
    pub profile_status: Option<String>,
    pub asset_tag: Option<String>,
    pub description: Option<String>,
    pub blueprint_id: Option<String>,
    pub user: Option<String>,
    pub color: Option<String>,
}

/// One page of an ADE token's devices plus pagination metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdeDevicePage {
    pub devices: Vec<AdeDevice>,
    pub page: u32,
    pub total_pages: u32,
    pub total_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Blueprint {
    pub id: String,
    pub name: String,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Normalize all 4 Kandji response shapes into a Vec<Value>.
/// Quirk 5: plain array | { results: [] } | { data: [] } | single object
fn normalize_list(val: Value) -> Vec<Value> {
    if val.is_array() {
        val.as_array().cloned().unwrap_or_default()
    } else if let Some(arr) = val.get("results").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = val.get("data").and_then(|v| v.as_array()) {
        arr.clone()
    } else if val.is_object() {
        vec![val]
    } else {
        vec![]
    }
}

/// Compute days_left from access_token_expiry ISO string.
/// Quirk 6: field may be absent.
fn compute_days_left(expiry: Option<&str>) -> Option<i64> {
    let expiry = expiry?;
    let expiry_ts = chrono::DateTime::parse_from_rfc3339(expiry)
        .or_else(|_| {
            // Try parsing without timezone suffix
            chrono::NaiveDateTime::parse_from_str(expiry, "%Y-%m-%dT%H:%M:%SZ")
                .map(|dt| dt.and_utc().fixed_offset())
        })
        .ok()?;
    let now = chrono::Utc::now();
    let diff = expiry_ts.signed_duration_since(now);
    Some(diff.num_days())
}

fn parse_ade_token(v: &Value) -> AdeToken {
    let expiry = v
        .get("access_token_expiry")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let days_left = v
        .get("days_left")
        .and_then(|x| x.as_i64())
        .or_else(|| compute_days_left(expiry.as_deref()));

    let str_at = |path: &[&str]| -> Option<String> {
        let mut cur = v;
        for key in path {
            cur = cur.get(*key)?;
        }
        cur.as_str().map(|s| s.to_string())
    };

    AdeToken {
        id: v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        server_name: str_at(&["server_name"]),
        access_token_expiry: expiry,
        days_left,
        // device_counts: { total: N, iPad: …, AppleTV: … }
        device_count: v
            .get("device_counts")
            .and_then(|c| c.get("total"))
            .and_then(|x| x.as_i64()),
        // blueprint: { id, name, … }
        blueprint_id: str_at(&["blueprint", "id"]),
        blueprint_name: str_at(&["blueprint", "name"]),
        // defaults.email is what's used for new enrollments; admin_id is who uploaded the token
        email: str_at(&["defaults", "email"]).or_else(|| str_at(&["admin_id"])),
        phone: str_at(&["defaults", "phone"]).or_else(|| str_at(&["org_phone"])),
        last_device_sync: str_at(&["last_device_sync"]),
    }
}

fn parse_ade_device(v: &Value) -> AdeDevice {
    let str_field = |key: &str| -> Option<String> {
        v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
    };

    AdeDevice {
        // The device's own field name is `id`, not `device_id`.
        device_id: v
            .get("id")
            .or_else(|| v.get("device_id"))
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        // Device name lives on the nested mdm_device object (may be null).
        name: v
            .get("mdm_device")
            .and_then(|d| d.get("name"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        serial_number: str_field("serial_number"),
        model: str_field("model"),
        device_family: str_field("device_family"),
        os: str_field("os"),
        profile_status: str_field("profile_status"),
        asset_tag: str_field("asset_tag"),
        description: str_field("description"),
        blueprint_id: str_field("blueprint_id"),
        // `user` / `user_id` is a numeric user ID (or null), not a string.
        user: v
            .get("user_id")
            .or_else(|| v.get("user"))
            .and_then(|x| {
                x.as_i64()
                    .map(|n| n.to_string())
                    .or_else(|| x.as_str().map(|s| s.to_string()))
            }),
        color: str_field("color"),
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

/// List all ADE tokens.
/// Quirk 1: trailing slash required.
/// Quirk 5: normalize response shape.
/// Quirk 6: compute days_left if absent.
#[tauri::command]
pub async fn list_ade_tokens() -> Result<Vec<AdeToken>, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let res = client
        .get(format!("{}/integrations/apple/ade/", base)) // Quirk 1
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let items = normalize_list(body);
    Ok(items.iter().map(parse_ade_token).collect())
}

/// Download the Kandji public key as a PEM string.
/// Quirk 2: endpoint uses public_key (underscore), trailing slash required.
#[tauri::command]
pub async fn download_ade_public_key() -> Result<String, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let res = client
        .get(format!("{}/integrations/apple/ade/public_key/", base)) // Quirk 2
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    res.text().await.map_err(|e| e.to_string())
}

/// Upload a new ADE token (.p7m bytes).
/// Quirk 1: trailing slash on POST.
/// Quirk 3: file field must be named "file".
/// Quirk 4: blueprint_id must be UUID string.
#[tauri::command]
pub async fn upload_ade_token(
    file_bytes: Vec<u8>,
    filename: String,
    blueprint_id: Option<String>,
    phone: Option<String>,
    email: Option<String>,
) -> Result<AdeToken, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let file_part = multipart::Part::bytes(file_bytes)
        .file_name(filename)
        .mime_str("application/pkcs7-mime")
        .map_err(|e| e.to_string())?;

    let mut form = multipart::Form::new().part("file", file_part); // Quirk 3

    if let Some(bp) = blueprint_id {
        if !bp.is_empty() {
            form = form.text("blueprint_id", bp); // Quirk 4: must be UUID
        }
    }
    if let Some(p) = phone {
        if !p.is_empty() {
            form = form.text("phone", p);
        }
    }
    if let Some(e) = email {
        if !e.is_empty() {
            form = form.text("email", e);
        }
    }

    let res = client
        .post(format!("{}/integrations/apple/ade/", base)) // Quirk 1
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        // Quirk 7: code 2002 is a catch-all — surface the raw body
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(parse_ade_token(&body))
}

/// Renew an existing ADE token.
/// Quirk 8: .p7m tokens are single-use — surface errors clearly.
#[tauri::command]
pub async fn renew_ade_token(
    ade_id: String,
    file_bytes: Vec<u8>,
    filename: String,
    blueprint_id: Option<String>,
    phone: Option<String>,
    email: Option<String>,
) -> Result<AdeToken, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let file_part = multipart::Part::bytes(file_bytes)
        .file_name(filename)
        .mime_str("application/pkcs7-mime")
        .map_err(|e| e.to_string())?;

    let mut form = multipart::Form::new().part("file", file_part); // Quirk 3

    if let Some(bp) = blueprint_id {
        if !bp.is_empty() {
            form = form.text("blueprint_id", bp);
        }
    }
    if let Some(p) = phone {
        if !p.is_empty() {
            form = form.text("phone", p);
        }
    }
    if let Some(e) = email {
        if !e.is_empty() {
            form = form.text("email", e);
        }
    }

    let res = client
        .post(format!("{}/integrations/apple/ade/{}/renew", base, ade_id))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        // Quirk 8: if code 2002 appears, likely single-use token was reused
        if body.contains("2002") {
            return Err(format!(
                "HTTP {}: Token upload failed — this .p7m file may have already been used. \
                 Go back to Apple Business Manager and download a fresh token before retrying. \
                 Raw response: {}",
                status, body
            ));
        }
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(parse_ade_token(&body))
}

/// The devices endpoint (Quirk 10) returns a fixed maximum of 300 devices per
/// page and accepts only the `page` param — page size is not modifiable.
const DEVICE_PAGE_SIZE: i64 = 300;

/// Fetch a single page of an ADE token's devices, lazily (one page per call).
/// Returns the page's devices plus pagination metadata so the UI can render a
/// page selector without loading every page up front.
#[tauri::command]
pub async fn list_ade_token_devices(ade_id: String, page: u32) -> Result<AdeDevicePage, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let page = page.max(1);
    let res = client
        .get(format!(
            "{}/integrations/apple/ade/{}/devices?page={}",
            base, ade_id, page
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    // DRF envelope: `count` is the total across all pages.
    let total_count = body.get("count").and_then(|c| c.as_i64()).unwrap_or(0);
    let total_pages = if total_count <= 0 {
        1
    } else {
        (((total_count + DEVICE_PAGE_SIZE - 1) / DEVICE_PAGE_SIZE) as u32).max(1)
    };
    let items = normalize_list(body);
    let devices = items.iter().map(parse_ade_device).collect();

    Ok(AdeDevicePage {
        devices,
        page,
        total_pages,
        total_count,
    })
}

/// Search ADE devices by serial number via the tenant-wide devices endpoint
/// (`/integrations/apple/ade/devices?serial_number=…`). Same device shape as the
/// per-token list, so parse_ade_device applies unchanged. Results are filtered
/// to `ade_id` (the token the search was run from) by matching `dep_account.id`,
/// so only devices belonging to that token are returned.
#[tauri::command]
pub async fn search_ade_devices_by_serial(
    serial: String,
    ade_id: String,
) -> Result<Vec<AdeDevice>, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let res = client
        .get(format!("{}/integrations/apple/ade/devices", base))
        .query(&[("serial_number", serial.trim())])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let items = normalize_list(body);
    Ok(items
        .iter()
        .filter(|v| {
            v.get("dep_account")
                .and_then(|d| d.get("id"))
                .and_then(|x| x.as_str())
                == Some(ade_id.as_str())
        })
        .map(parse_ade_device)
        .collect())
}

/// Get all blueprints for UUID → name resolution.
#[tauri::command]
pub async fn get_blueprints() -> Result<Vec<Blueprint>, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let res = client
        .get(format!("{}/blueprints?limit=300", base))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let items = normalize_list(body);

    Ok(items
        .iter()
        .filter_map(|v| {
            let id = v.get("id")?.as_str()?.to_string();
            let name = v.get("name")?.as_str()?.to_string();
            Some(Blueprint { id, name })
        })
        .collect())
}

/// Update an ADE device's blueprint, asset_tag, or user.
#[tauri::command]
pub async fn update_ade_device(
    device_id: String,
    blueprint_id: Option<String>,
    asset_tag: Option<String>,
    user: Option<String>,
) -> Result<AdeDevice, String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let mut payload = serde_json::Map::new();
    if let Some(bp) = blueprint_id {
        payload.insert("blueprint_id".to_string(), Value::String(bp));
    }
    if let Some(at) = asset_tag {
        payload.insert("asset_tag".to_string(), Value::String(at));
    }
    if let Some(u) = user {
        payload.insert("user".to_string(), Value::String(u));
    }

    let res = client
        .patch(format!(
            "{}/integrations/apple/ade/devices/{}", // Quirk 1: no trailing slash on PATCH
            base, device_id
        ))
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(parse_ade_device(&body))
}

/// Delete an ADE integration.
/// Quirk 1: trailing slash required.
#[tauri::command]
pub async fn delete_ade_token(ade_id: String) -> Result<(), String> {
    let creds = get_stored_creds()?;
    let token = get_stored_token()?;
    let client = build_client(&token).map_err(|e| e.to_string())?;
    let base = get_base_url(&creds.subdomain, &creds.region);

    let res = client
        .delete(format!("{}/integrations/apple/ade/{}/", base, ade_id)) // Quirk 1
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() && res.status().as_u16() != 204 {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    Ok(())
}
