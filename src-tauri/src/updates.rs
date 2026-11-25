use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Config};
use tauri_plugin_updater::{Updater, UpdaterExt};

const ENDPOINT: &str = "https://github.com/phuongtrangpt/MIKROTIK-AUTO-CONFIG-OFFLINE/releases/download/v2-desktop-preview/latest.json";

pub fn enabled(config: &Config) -> bool {
    cfg!(target_os = "windows")
        && config
            .plugins
            .0
            .get("updater")
            .and_then(|value| value.get("pubkey"))
            .and_then(|value| value.as_str())
            .is_some_and(|key| !key.trim().is_empty())
}

fn updater(app: &AppHandle) -> Result<Updater, String> {
    if !enabled(app.config()) {
        return Err("Bản thử nghiệm này chưa cấu hình khóa xác minh cập nhật.".to_owned());
    }
    let endpoint = ENDPOINT
        .parse()
        .map_err(|_| "Địa chỉ cập nhật không hợp lệ.")?;
    app.updater_builder()
        .endpoints(vec![endpoint])
        .and_then(|builder| builder.build())
        .map_err(|_| "Không thể khởi tạo bộ cập nhật.".to_owned())
}

#[tauri::command]
pub fn update_available(app: AppHandle) -> bool {
    enabled(app.config())
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<String>, String> {
    let update = updater(&app)?
        .check()
        .await
        .map_err(|_| "Không kiểm tra được kênh cập nhật thử nghiệm.")?;
    Ok(update.map(|update| update.version))
}

#[derive(Clone, Serialize)]
pub struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    version: String,
    progress: Channel<Progress>,
) -> Result<(), String> {
    let update = updater(&app)?
        .check()
        .await
        .map_err(|_| "Không kiểm tra được kênh cập nhật thử nghiệm.")?
        .filter(|update| update.version == version)
        .ok_or("Bản cập nhật đã thay đổi. Hãy kiểm tra phiên bản lại.")?;
    let mut downloaded = 0_u64;
    update
        .download_and_install(
            |bytes, total| {
                downloaded = downloaded.saturating_add(bytes as u64);
                let _ = progress.send(Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|_| "Tải hoặc xác minh chữ ký bản cập nhật thất bại.".to_owned())
}
