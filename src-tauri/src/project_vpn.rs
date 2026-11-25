use studio_routeros::project_vpn::{Options, Profile};

#[cfg(windows)]
mod windows;

#[tauri::command]
pub async fn vpn_prepare(app: tauri::AppHandle, options: Options) -> Result<Profile, String> {
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || windows::prepare(&app, options))
        .await
        .map_err(|_| "Không tạo được cấu hình VPN.".to_owned())?;
    #[cfg(not(windows))]
    {
        let _ = (app, options);
        Err("VPN dự án cần WireGuard for Windows.".into())
    }
}

#[tauri::command]
pub async fn vpn_script(app: tauri::AppHandle, id: String) -> Result<String, String> {
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || windows::script(&app, &id))
        .await
        .map_err(|_| "Không đọc được lệnh cài VPN.".to_owned())?;
    #[cfg(not(windows))]
    {
        let _ = (app, id);
        Err("VPN dự án cần WireGuard for Windows.".into())
    }
}

#[tauri::command]
pub async fn vpn_connect(app: tauri::AppHandle, id: String) -> Result<(), String> {
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || windows::start(&app, &id))
        .await
        .map_err(|_| "Không khởi động được đường hầm VPN.".to_owned())?;
    #[cfg(not(windows))]
    {
        let _ = (app, id);
        Err("VPN dự án cần WireGuard for Windows.".into())
    }
}

#[tauri::command]
pub async fn vpn_disconnect(app: tauri::AppHandle, id: String, remove: bool) -> Result<(), String> {
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || windows::stop(&app, &id, remove))
        .await
        .map_err(|_| "Không dừng được đường hầm VPN.".to_owned())?;
    #[cfg(not(windows))]
    {
        let _ = (app, id, remove);
        Err("VPN dự án cần WireGuard for Windows.".into())
    }
}
