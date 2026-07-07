# Iru ADE Manager — Project Context

## What This Is

A standalone macOS app (Tauri 2.0 + React/TypeScript) that lets IT admins manage Iru ADE (Automated Device Enrollment) tokens without needing any developer tooling. Drag `.app` to Applications and go.

**Source of original API knowledge:** a private reference repo (not committed here) containing:
- `ADE-API-QUIRKS.md` — 8 critical API quirks encoded in Rust (a 9th was added later from live-tenant testing; see API Quirks section)
- `ADE-MANAGER-PRD.md` — product requirements
- `kandji.ts`, `page.tsx`, `AdeTokenUploadDialog.tsx` — original Next.js components this was adapted from

---

## Current Status: v0.1.0 — SIGNED + NOTARIZED

### What works
- ✅ First-run credential setup (subdomain + Bearer token + US/EU region)
- ✅ Credentials stored in macOS Keychain via `keyring` crate (token never crosses IPC to WebView)
- ✅ "Test & Save" connection check before saving
- ✅ "Change Credentials" (Settings gear → clears Keychain, returns to setup screen)
- ✅ List all ADE tokens with colour-coded expiry badges (red ≤30d, amber ≤90d, green >90d)
- ✅ Expand token → paginated device table with blueprint UUIDs resolved to names
- ✅ Add new token — 2-step wizard: download `.pem` (native Save dialog) → upload `.p7m`
- ✅ Renew token — 2-step wizard: ABM instructions → upload `.p7m`
- ✅ Remove token — native confirm dialog (`ask()`) → delete integration
- ✅ Edit ADE device — blueprint / asset tag / user via PATCH
- ✅ All 8 API quirks from `ADE-API-QUIRKS.md` (plus a 9th, discovered live: nested fields on the list endpoint) encoded in Rust (`src-tauri/src/commands/ade.rs`)

### What's pending
- ✅ Tested, on live Iru — end to end. May 2026.

### Known issues / gotchas
1. **Node ≥ 20 required** — Vite 7 needs Node ≥ 20. Default `nvm` Node on this machine is v24.15.0, which works. (Earlier notes said "Node 22 required" — Node 22 is not installed; use the default `nvm use default`.)
2. **`bundle_dmg.sh` works** — earlier CLAUDE.md said this script was broken; current Tauri CLI builds the DMG successfully end-to-end. No `hdiutil` workaround needed.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Tauri 2.0 |
| Frontend | React 18 + TypeScript + Vite 7 |
| Styling | Tailwind CSS v4 (@tailwindcss/vite plugin) |
| UI components | Custom shadcn-style (Radix UI primitives) in `src/components/ui/` |
| Icons | Lucide React |
| HTTP | Rust `reqwest` 0.12 (multipart + json features) |
| Keychain | Rust `keyring` 3.x (apple-native feature) |
| Date parsing | Rust `chrono` 0.4 |
| File dialogs | `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs` |

---

## Project Structure

```
iru-ade-manager/
├── CLAUDE.md                         ← you are here
├── package.json                      (pnpm, Node 20+)
├── vite.config.ts                    (Tailwind v4 via @tailwindcss/vite)
├── src/
│   ├── main.tsx                      (entry — imports App.css for Tailwind)
│   ├── App.css                       (@import "tailwindcss" + base reset)
│   ├── App.tsx                       (loading → CredentialSetupDialog OR main layout)
│   ├── api/
│   │   └── kandji.ts                 (thin invoke() wrappers for all Rust commands)
│   ├── pages/
│   │   └── AdeTokensPage.tsx         (main page — token list, expand, add/renew/delete)
│   ├── components/
│   │   ├── AdeTokenUploadDialog.tsx  (add + renew wizards, FileDropZone, StepIndicator)
│   │   ├── AdeEditDialog.tsx         (edit device: blueprint / asset_tag / user)
│   │   ├── CredentialSetupDialog.tsx (first-run fullscreen credential entry)
│   │   └── ui/
│   │       ├── button.tsx            (CVA-based Button with variant/size)
│   │       ├── card.tsx
│   │       ├── badge.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── dialog.tsx            (Radix UI Dialog wrapper)
│   └── lib/
│       ├── types.ts                  (AdeToken, AdeDevice, Blueprint, Credentials, HealthResult)
│       └── utils.ts                  (cn, formatDate, formatRelativeDate, shortenUuid, computeDaysLeft)
└── src-tauri/
    ├── Cargo.toml                    (keyring, reqwest, chrono, tauri-plugin-dialog/fs)
    ├── tauri.conf.json               (identifier: io.iru.ade-manager, 1100×720 window)
    ├── capabilities/default.json     (dialog:default, dialog:allow-save, dialog:allow-ask, fs:default, fs:allow-write-text-file)
    └── src/
        ├── main.rs
        ├── lib.rs                    (plugin registration + all command registration)
        ├── http_client.rs            (get_base_url, build_client — reqwest + auth header)
        └── commands/
            ├── mod.rs
            ├── credentials.rs        (load_credentials, save_credentials, clear_credentials, get_stored_token [internal])
            ├── health.rs             (check_connection — used by CredentialSetupDialog test button)
            └── ade.rs                (list_ade_tokens, download_ade_public_key, upload_ade_token,
                                       renew_ade_token, list_ade_token_devices, get_blueprints,
                                       update_ade_device, delete_ade_token)
```

---

## Tauri Commands Reference

All commands registered in `src-tauri/src/lib.rs` and called from `src/api/kandji.ts`:

| JS function | Rust command | Notes |
|---|---|---|
| `loadCredentials()` | `load_credentials` | Returns `{subdomain, region}` or null — token stays in Keychain |
| `saveCredentials(sub, token, region)` | `save_credentials` | Stores all 3 in Keychain under `io.iru.ade-manager` |
| `clearCredentials()` | `clear_credentials` | Deletes all 3 Keychain entries |
| `checkConnection(sub, token, region)` | `check_connection` | Hits `GET /devices?limit=1`, returns `{ok, error?}` |
| `listAdeTokens()` | `list_ade_tokens` | Normalises all 4 Kandji response shapes; computes `days_left` if absent |
| `downloadAdePublicKey()` | `download_ade_public_key` | Returns PEM string; frontend opens native Save dialog |
| `uploadAdeToken(fileBytes, filename, ...)` | `upload_ade_token` | File field must be `"file"`, blueprint_id must be UUID |
| `renewAdeToken(adeId, fileBytes, ...)` | `renew_ade_token` | Error 2002 = single-use token reused — custom error message |
| `listAdeTokenDevices(adeId)` | `list_ade_token_devices` | Page-based pagination loop |
| `getBlueprints()` | `get_blueprints` | UUID → name map for device table |
| `updateAdeDevice(deviceId, payload)` | `update_ade_device` | JSON PATCH — blueprint_id, asset_tag, user |
| `deleteAdeToken(adeId)` | `delete_ade_token` | DELETE with trailing slash (Quirk 1) |

---

## API Quirks Encoded in Rust (DO NOT REGRESS)

Quirks 1–8 come from the original `ADE-API-QUIRKS.md` reference doc. Quirk 9 was discovered against a live tenant in v0.1.0 and is not in that doc. All are encoded in `src-tauri/src/commands/ade.rs`:

1. **Trailing slashes required** on all ADE endpoints (`/ade/`, `/ade/{id}/`)
2. **Public key path**: `/public_key/` — underscore, not hyphen
3. **Upload field name**: `"file"` — NOT `"mdm_signed_token"`
4. **Blueprint field**: UUID string — NOT human-readable name
5. **Response shapes**: normalised via `normalize_list()` — handles array, `{results}`, `{data}`, single object
6. **`days_left` may be absent**: computed from `access_token_expiry` via `compute_days_left()`
7. **Error 2002** is a catch-all — raw body surfaced; renew path gives specific "single-use token" message
8. **`.p7m` tokens are single-use** — documented in UI warning; error 2002 on renew = must redownload from ABM
9. **Per-token fields are nested, not flat** on `GET /integrations/apple/ade/`. `parse_ade_token` reads:
   - `device_count` ← `device_counts.total` (object with `total`/`iPad`/`AppleTV`/… — **not** a flat `device_count` int)
   - `blueprint_id` / `blueprint_name` ← `blueprint.id` / `blueprint.name` (nested object — **not** flat `blueprint_id`)
   - `email` ← `defaults.email` (fallback `admin_id`); `phone` ← `defaults.phone` (fallback `org_phone`)
   - `last_device_sync` is the real field name — there is no `last_modified`, and `mdm_server_name` doesn't exist (use `server_name`)
10. **Device list uses DRF page pagination** on `GET /integrations/apple/ade/{id}/devices?page=N` (envelope: `count`/`next`/`previous`/`results`). **`page` is the only param and page size is a fixed 300 (not modifiable).** Requesting a page past the last returns **HTTP 404 "Invalid page."**, not an empty page. `list_ade_token_devices(ade_id, page)` fetches **one page per call** and returns an `AdeDevicePage { devices, page, total_pages, total_count }` (`total_pages` = `ceil(count / 300)`). The UI loads pages **lazily** (first page on expand, others only when selected via the page selector) and caches visited pages — it does **not** load all pages up front. `parse_ade_device` also reads:
   - `device_id` ← `id` (the device's own field is `id`, **not** `device_id`) — needed for the edit PATCH URL
   - `name` ← `mdm_device.name` (nested object, may be null)
   - `user` ← numeric `user_id`/`user` (an integer id, **not** a string; no name/email in this payload — the UI leaves the user column out)

---

## Build Commands

```bash
# Activate Node ≥ 20 (default nvm Node is v24, which works)
source ~/.nvm/nvm.sh && nvm use default
. "$HOME/.cargo/env"

# Load signing/notarization secrets (see Signing section)
set -a && source .env && set +a

# Hot-reload dev mode
pnpm tauri dev

# Production build — signs + notarizes + staples automatically when .env is loaded
pnpm tauri build

# Universal binary (Apple Silicon + Intel) — for distribution
pnpm tauri build --target universal-apple-darwin
```

### Build artifacts
After `pnpm tauri build`:
- `src-tauri/target/release/bundle/macos/Iru ADE Manager.app` — signed + notarized + stapled
- `src-tauri/target/release/bundle/dmg/Iru ADE Manager_0.2.0_aarch64.dmg` — signed (DMG-level staple is a separate step, see below)

### Verify Gatekeeper acceptance
```bash
spctl --assess --type execute --verbose=2 "src-tauri/target/release/bundle/macos/Iru ADE Manager.app"
# expect: "accepted  source=Notarized Developer ID"
stapler validate "src-tauri/target/release/bundle/macos/Iru ADE Manager.app"
# expect: "The validate action worked!"
```

---

## Signing & Notarization

Signing identity is wired into `src-tauri/tauri.conf.json` (`bundle.macOS.signingIdentity` + `providerShortName`). Notarization secrets live in `.env` (gitignored):

```bash
APPLE_ID="<your-apple-id@example.com>"
APPLE_TEAM_ID="<your-10-char-team-id>"
APPLE_SIGNING_IDENTITY="Developer ID Application: <Your Name> (<TEAMID>)"
APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"      # app-specific password from appleid.apple.com — 4 groups
APPLE_ID_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # same value; some tooling reads this name
```

The actual signing identity values used for the published v0.1.0 release are stored in `tauri.conf.json` (visible in the repo) and `.env` (local only). Forks should replace both with their own Developer ID.

**IMPORTANT — env var name:** Tauri's bundler reads `APPLE_PASSWORD`, NOT `APPLE_ID_PASSWORD`. Earlier docs in this file had the wrong name; using only `APPLE_ID_PASSWORD` causes Tauri to skip notarization with "no APPLE_ID & APPLE_PASSWORD & APPLE_TEAM_ID … environment variables found".

**App-specific password format:** Apple's app-specific passwords are 4 groups of 4 lowercase chars (`xxxx-xxxx-xxxx-xxxx`). A 5-group value will get HTTP 401 "Unable to authenticate" from notarytool.

To build:
```bash
set -a && source .env && set +a
pnpm tauri build
```
Tauri CLI handles `codesign`, `xcrun notarytool submit --wait`, and `xcrun stapler staple` for the `.app` automatically.

### DMG-level notarization (optional but recommended for distribution)
Tauri notarizes the `.app` but not the enclosing DMG. Run manually if you want the DMG itself stapled (avoids "downloaded from internet" prompt on first open):
```bash
xcrun notarytool submit "src-tauri/target/release/bundle/dmg/Iru ADE Manager_0.2.0_aarch64.dmg" \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" --wait
xcrun stapler staple "src-tauri/target/release/bundle/dmg/Iru ADE Manager_0.2.0_aarch64.dmg"
```

Requires: Apple Developer Program ($99/yr), Developer ID Application certificate in login keychain.

---

## v2 Backlog (from PRD)

These were explicitly deferred and are **not** in the current build:

- [ ] Bulk device edit (select multiple ADE devices, set blueprint/user in one call)
- [ ] Sync trigger (if Kandji API supports it)
- [ ] Export device list as CSV
- [ ] Auto-refresh / expiry countdown
- [ ] macOS menu bar integration
- [ ] Mac App Store submission (requires sandbox compliance review)

---

## Key Design Decisions (don't change without reason)

1. **Bearer token never sent to WebView** — `load_credentials` returns `{subdomain, region}` only; all API calls made in Rust using token read directly from Keychain inside each command handler.
2. **No HTTP from WebView** — `tauri.conf.json` CSP is null (allows all), but no `fetch()` to external URLs happens in JS. All API traffic goes through Rust IPC commands.
3. **File bytes passed as `Vec<u8>` / `number[]`** — `.p7m` file is read in JS via `file.arrayBuffer()` → `Array.from(new Uint8Array(buf))`, then passed to Rust as `file_bytes: Vec<u8>`. No Tauri FS plugin needed for reads.
4. **`keyring` crate, not `tauri-plugin-keychain`** — the Tauri keychain plugin doesn't exist in the npm registry. Using the `keyring` Rust crate directly (apple-native feature) which calls macOS Security framework.
