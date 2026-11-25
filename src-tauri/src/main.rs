#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::BTreeMap;
use studio_routeros::{Backup, Connection, RouterInfo};

#[tauri::command]
async fn router_info(connection: Connection) -> Result<RouterInfo, String> {
    tauri::async_runtime::spawn_blocking(move || studio_routeros::inspect(&connection))
        .await
        .map_err(|_| "Không đọc được thông tin router.".to_owned())?
}

#[tauri::command]
async fn router_backup(connection: Connection, backup: Backup) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || studio_routeros::save_backup(&connection, &backup))
        .await
        .map_err(|_| "Không thể tạo bản sao lưu.".to_owned())?
}

#[tauri::command]
async fn ppp_subscribers(connection: Connection) -> Result<Vec<BTreeMap<String, String>>, String> {
    tauri::async_runtime::spawn_blocking(move || studio_routeros::subscribers(&connection))
        .await
        .map_err(|_| "Không đọc được thuê bao PPPoE.".to_owned())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            router_info,
            router_backup,
            ppp_subscribers
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start MikroTik Studio");
}
