mod commands;
mod http_client;

use commands::ade::*;
use commands::credentials::*;
use commands::health::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Credentials
            load_credentials,
            save_credentials,
            clear_credentials,
            // Health check
            check_connection,
            // ADE
            list_ade_tokens,
            download_ade_public_key,
            upload_ade_token,
            renew_ade_token,
            list_ade_token_devices,
            search_ade_devices_by_serial,
            get_blueprints,
            update_ade_device,
            delete_ade_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
