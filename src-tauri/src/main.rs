#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod updates;

use std::collections::BTreeMap;
use studio_routeros::{Backup, Connection, RouterInfo, Subscriber};

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

#[tauri::command]
async fn ppp_profiles(connection: Connection) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || studio_routeros::ppp_profiles(&connection))
        .await
        .map_err(|_| "Không đọc được gói cước PPPoE.".to_owned())?
}

#[tauri::command]
async fn ppp_save(connection: Connection, subscriber: Subscriber) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        studio_routeros::save_subscriber(&connection, &subscriber)
    })
    .await
    .map_err(|_| "Không lưu được thuê bao PPPoE.".to_owned())?
}

fn main() {
    let context = tauri::generate_context!();
    let mut builder = tauri::Builder::default();
    if updates::enabled(context.config()) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    let result = builder
        .invoke_handler(tauri::generate_handler![
            router_info,
            router_backup,
            ppp_subscribers,
            ppp_profiles,
            ppp_save,
            updates::update_available,
            updates::update_check,
            updates::update_install
        ])
        .run(context);
    if let Err(error) = result {
        report_startup_error(&error);
        std::process::exit(1);
    }
}

fn report_startup_error(error: &tauri::Error) {
    eprintln!("MikroTik Studio: {error}");

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

        let mut message = format!("Không thể khởi động MikroTik Studio.\n\n{error}")
            .encode_utf16()
            .collect::<Vec<_>>();
        message.push(0);
        let title = "MikroTik Studio – Lỗi khởi động\0"
            .encode_utf16()
            .collect::<Vec<_>>();
        // Both UTF-16 strings are NUL-terminated and live throughout the call.
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
}
