use std::{
    ffi::OsStr,
    fs, io,
    os::windows::ffi::{OsStrExt, OsStringExt},
    path::{Path, PathBuf},
    ptr::{null, null_mut},
    thread,
    time::{Duration, Instant},
};
use studio_routeros::project_vpn::{self, Options, Profile};
use tauri::{AppHandle, Manager};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree, ERROR_SERVICE_DOES_NOT_EXIST, WAIT_OBJECT_0},
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_LOCAL_MACHINE,
        CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
    System::{
        Services::{
            CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatus,
            SC_MANAGER_CONNECT, SERVICE_QUERY_STATUS, SERVICE_RUNNING, SERVICE_START_PENDING,
            SERVICE_STATUS,
        },
        SystemInformation::GetSystemDirectoryW,
        Threading::{GetExitCodeProcess, WaitForSingleObject},
    },
    UI::{
        Shell::{
            SHGetFolderPathW, ShellExecuteExW, CSIDL_PROGRAM_FILES, SEE_MASK_NOASYNC,
            SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
        },
        WindowsAndMessaging::SW_HIDE,
    },
};

fn wide(value: impl AsRef<OsStr>) -> Vec<u16> {
    value.as_ref().encode_wide().chain([0]).collect()
}

fn vault(app: &AppHandle, id: &str) -> Result<(String, PathBuf), String> {
    if id.len() != 16
        || !id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("Mã VPN dự án không hợp lệ.".into());
    }
    let name = format!("studio-{id}");
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Không mở được dữ liệu dự án.")?
        .join("project-vpn")
        .join(&name);
    Ok((name, dir))
}

fn dpapi(input: &[u8], description: &str, mode: Option<bool>) -> Result<Vec<u8>, String> {
    let data = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let description = wide(description);
    // DPAPI allocates the result with LocalAlloc. Its input and output live until the call returns.
    unsafe {
        let flags = CRYPTPROTECT_UI_FORBIDDEN;
        let ok = match mode {
            Some(machine) => CryptProtectData(
                &data,
                description.as_ptr(),
                null(),
                null(),
                null(),
                flags
                    | if machine {
                        CRYPTPROTECT_LOCAL_MACHINE
                    } else {
                        0
                    },
                &mut output,
            ),
            None => CryptUnprotectData(
                &data,
                null_mut(),
                null(),
                null(),
                null(),
                flags,
                &mut output,
            ),
        };
        if ok == 0 {
            return Err("Windows không mở được dữ liệu VPN đã mã hóa.".into());
        }
        let bytes = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        let result = bytes.to_vec();
        bytes.fill(0);
        LocalFree(output.pbData.cast());
        Ok(result)
    }
}

pub fn prepare(app: &AppHandle, options: Options) -> Result<Profile, String> {
    let provision = project_vpn::prepare(options)?;
    let (name, dir) = vault(app, &provision.profile.id)?;
    let tunnel = dpapi(provision.tunnel.as_bytes(), &name, Some(true))?;
    let script = dpapi(provision.script.as_bytes(), &name, Some(false))?;
    fs::create_dir_all(dir.parent().ok_or("Đường dẫn dự án không hợp lệ.")?)
        .and_then(|_| fs::create_dir(&dir))
        .map_err(|_| "Không tạo được thư mục VPN dự án.")?;
    let written = fs::write(dir.join(format!("{name}.conf.dpapi")), tunnel)
        .and_then(|_| fs::write(dir.join("setup.rsc.dpapi"), script));
    if written.is_err() {
        let _ = fs::remove_dir_all(&dir);
        return Err("Không lưu được cấu hình VPN đã mã hóa.".into());
    }
    Ok(provision.profile)
}

pub fn script(app: &AppHandle, id: &str) -> Result<String, String> {
    let (name, dir) = vault(app, id)?;
    let bytes =
        fs::read(dir.join("setup.rsc.dpapi")).map_err(|_| "Thiếu bản cài VPN trên máy này.")?;
    String::from_utf8(dpapi(&bytes, &name, None)?).map_err(|_| "Lệnh cài VPN không hợp lệ.".into())
}

fn wireguard() -> Result<PathBuf, String> {
    let mut path = [0u16; 260];
    // The buffer has MAX_PATH characters as required by SHGetFolderPathW.
    let result = unsafe {
        SHGetFolderPathW(
            null_mut(),
            CSIDL_PROGRAM_FILES as i32,
            null_mut(),
            0,
            path.as_mut_ptr(),
        )
    };
    if result < 0 {
        return Err("Không tìm được thư mục Program Files.".into());
    }
    let len = path.iter().position(|&c| c == 0).unwrap_or(path.len());
    let path = PathBuf::from(std::ffi::OsString::from_wide(&path[..len]))
        .join("WireGuard")
        .join("wireguard.exe");
    if path.is_file() {
        Ok(path)
    } else {
        Err("Cần cài WireGuard for Windows từ wireguard.com để kết nối VPN dự án.".into())
    }
}

fn system_sc() -> Result<PathBuf, String> {
    let mut path = [0u16; 260];
    let len = unsafe { GetSystemDirectoryW(path.as_mut_ptr(), path.len() as u32) } as usize;
    if len == 0 || len >= path.len() {
        return Err("Không tìm được dịch vụ Windows.".into());
    }
    Ok(PathBuf::from(std::ffi::OsString::from_wide(&path[..len])).join("sc.exe"))
}

fn service_state(name: &str) -> Result<Option<u32>, String> {
    let service_name = wide(format!("WireGuardTunnel${name}"));
    unsafe {
        let manager = OpenSCManagerW(null(), null(), SC_MANAGER_CONNECT);
        if manager.is_null() {
            return Err("Không đọc được dịch vụ Windows.".into());
        }
        let service = OpenServiceW(manager, service_name.as_ptr(), SERVICE_QUERY_STATUS);
        let result = if service.is_null() {
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(ERROR_SERVICE_DOES_NOT_EXIST as i32) {
                Ok(None)
            } else {
                Err("Không đọc được trạng thái dịch vụ WireGuard.".into())
            }
        } else {
            let mut status = SERVICE_STATUS::default();
            let ok = QueryServiceStatus(service, &mut status);
            CloseServiceHandle(service);
            if ok == 0 {
                Err("Không đọc được trạng thái dịch vụ WireGuard.".into())
            } else {
                Ok(Some(status.dwCurrentState))
            }
        };
        CloseServiceHandle(manager);
        result
    }
}

fn elevate(program: &Path, arguments: &OsStr) -> Result<(), String> {
    let program = wide(program);
    let arguments = wide(arguments);
    let verb = wide("runas");
    let mut request = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
        lpVerb: verb.as_ptr(),
        lpFile: program.as_ptr(),
        lpParameters: arguments.as_ptr(),
        nShow: SW_HIDE,
        ..Default::default()
    };
    unsafe {
        if ShellExecuteExW(&mut request) == 0 || request.hProcess.is_null() {
            return Err("Windows chưa cấp quyền quản trị để thay đổi VPN.".into());
        }
        let mut exit_code = 1;
        let ok = WaitForSingleObject(request.hProcess, 90_000) == WAIT_OBJECT_0
            && GetExitCodeProcess(request.hProcess, &mut exit_code) != 0;
        CloseHandle(request.hProcess);
        if ok && exit_code == 0 {
            Ok(())
        } else {
            Err("WireGuard chưa khởi động hoặc dừng được. Kiểm tra trạng thái đường hầm trong Windows.".into())
        }
    }
}

pub fn start(app: &AppHandle, id: &str) -> Result<(), String> {
    let (name, dir) = vault(app, id)?;
    let config = dir.join(format!("{name}.conf.dpapi"));
    if !config.is_file() {
        return Err(
            "Thiếu khóa VPN trên máy này. Cấu hình VPN cho dự án trên máy hiện tại.".into(),
        );
    }
    match service_state(&name)? {
        Some(SERVICE_RUNNING | SERVICE_START_PENDING) => {}
        Some(_) => elevate(
            &system_sc()?,
            OsStr::new(&format!("start WireGuardTunnel${name}")),
        )?,
        None => {
            let mut arguments = std::ffi::OsString::from("/installtunnelservice \"");
            arguments.push(config);
            arguments.push("\"");
            elevate(&wireguard()?, &arguments)?;
        }
    }
    let deadline = Instant::now() + Duration::from_secs(12);
    while Instant::now() < deadline {
        if service_state(&name)? == Some(SERVICE_RUNNING) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err("Dịch vụ WireGuard chưa chạy.".into())
}

pub fn stop(app: &AppHandle, id: &str, remove: bool) -> Result<(), String> {
    let (name, dir) = vault(app, id)?;
    if dir.is_dir() && service_state(&name)?.is_some() {
        elevate(
            &wireguard()?,
            OsStr::new(&format!("/uninstalltunnelservice {name}")),
        )?;
    }
    if remove && dir.is_dir() {
        fs::remove_dir_all(dir).map_err(|_| "Không xóa được khóa VPN đã lưu.")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protects_router_script_and_wireguard_service_config() {
        let name = "studio-0123456789abcdef";
        let data = b"credential fixture";
        for machine in [false, true] {
            let encrypted = dpapi(data, name, Some(machine)).unwrap();
            assert!(!encrypted.windows(data.len()).any(|bytes| bytes == data));
            assert_eq!(dpapi(&encrypted, name, None).unwrap(), data);
        }
    }
}
