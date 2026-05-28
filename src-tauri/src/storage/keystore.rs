//! Persists the master-password-derived key so the user can unlock without
//! re-entering their master password every launch.
//!
//! - Desktop: the OS keychain via the `keyring` crate (hardware/OS-backed).
//! - Android: a file in the app-private data directory. `keyring` has no Android
//!   backend; the app sandbox is per-app isolated but NOT hardware-backed, so this
//!   is a weaker guarantee than the desktop keychain (documented mobile tradeoff).

use crate::error::{AppError, AppResult};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod backend {
    use super::*;
    use keyring::Entry;

    const SERVICE: &str = "ssh-buddy";
    const ACCOUNT: &str = "master-key";

    fn entry() -> AppResult<Entry> {
        Entry::new(SERVICE, ACCOUNT).map_err(|e| AppError::Other(e.to_string()))
    }

    pub fn store(_app: &tauri::AppHandle, key: &[u8]) -> AppResult<()> {
        let hex: String = key.iter().map(|b| format!("{b:02x}")).collect();
        entry()?
            .set_password(&hex)
            .map_err(|e| AppError::Other(e.to_string()))
    }

    pub fn load(_app: &tauri::AppHandle) -> AppResult<Option<Vec<u8>>> {
        match entry()?.get_password() {
            Ok(hex) => Ok(Some(decode_hex(&hex)?)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Other(e.to_string())),
        }
    }

    pub fn clear(_app: &tauri::AppHandle) -> AppResult<()> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Other(e.to_string())),
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
mod backend {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    fn key_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
        let dir = app
            .path()
            .app_local_data_dir()
            .map_err(|e| AppError::Other(e.to_string()))?;
        fs::create_dir_all(&dir).map_err(|e| AppError::Other(e.to_string()))?;
        Ok(dir.join("master-key"))
    }

    pub fn store(app: &tauri::AppHandle, key: &[u8]) -> AppResult<()> {
        let hex: String = key.iter().map(|b| format!("{b:02x}")).collect();
        fs::write(key_path(app)?, hex).map_err(|e| AppError::Other(e.to_string()))
    }

    pub fn load(app: &tauri::AppHandle) -> AppResult<Option<Vec<u8>>> {
        let path = key_path(app)?;
        match fs::read_to_string(&path) {
            Ok(hex) => Ok(Some(decode_hex(hex.trim())?)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(AppError::Other(e.to_string())),
        }
    }

    pub fn clear(app: &tauri::AppHandle) -> AppResult<()> {
        match fs::remove_file(key_path(app)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(AppError::Other(e.to_string())),
        }
    }
}

fn decode_hex(hex: &str) -> AppResult<Vec<u8>> {
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Other(format!("key decode: {e}")))
}

#[tauri::command]
pub async fn storage_store_key(app: tauri::AppHandle, key: Vec<u8>) -> AppResult<()> {
    backend::store(&app, &key)
}

#[tauri::command]
pub async fn storage_load_key(app: tauri::AppHandle) -> AppResult<Option<Vec<u8>>> {
    backend::load(&app)
}

#[tauri::command]
pub async fn storage_clear_key(app: tauri::AppHandle) -> AppResult<()> {
    backend::clear(&app)
}
