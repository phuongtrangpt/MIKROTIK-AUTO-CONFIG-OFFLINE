#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod routeros;
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Unable to start MikroTik Studio");
}
