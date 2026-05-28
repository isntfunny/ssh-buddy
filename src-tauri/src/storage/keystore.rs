//! Persists the master-password-derived key on desktop via the OS keychain
//! (`keyring`). On mobile these commands are unused: the frontend stores the key
//! through the biometry plugin (hardware-backed Android Keystore / iOS Keychain,
//! gated by a fingerprint/biometric prompt). The commands still exist on mobile
//! so the shared invoke handler compiles, but they return an error if ever called.

use crate::error::AppResult;
#[cfg(any(target_os = "android", target_os = "ios"))]
use crate::error::AppError;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use crate::error::{AppError, AppResult};
    use keyring::Entry;

    const SERVICE: &str = "ssh-buddy";
    const ACCOUNT: &str = "master-key";

    fn entry() -> AppResult<Entry> {
        Entry::new(SERVICE, ACCOUNT).map_err(|e| AppError::Other(e.to_string()))
    }

    fn decode_hex(hex: &str) -> AppResult<Vec<u8>> {
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Other(format!("key decode: {e}")))
    }

    pub fn store(key: &[u8]) -> AppResult<()> {
        let hex: String = key.iter().map(|b| format!("{b:02x}")).collect();
        entry()?
            .set_password(&hex)
            .map_err(|e| AppError::Other(e.to_string()))
    }

    pub fn load() -> AppResult<Option<Vec<u8>>> {
        match entry()?.get_password() {
            Ok(hex) => Ok(Some(decode_hex(&hex)?)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Other(e.to_string())),
        }
    }

    pub fn clear() -> AppResult<()> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Other(e.to_string())),
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
const MOBILE_MSG: &str = "native keystore is desktop-only; mobile uses the biometry plugin";

#[tauri::command]
pub async fn storage_store_key(key: Vec<u8>) -> AppResult<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        desktop::store(&key)
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = key;
        Err(AppError::Other(MOBILE_MSG.into()))
    }
}

#[tauri::command]
pub async fn storage_load_key() -> AppResult<Option<Vec<u8>>> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        desktop::load()
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err(AppError::Other(MOBILE_MSG.into()))
    }
}

#[tauri::command]
pub async fn storage_clear_key() -> AppResult<()> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        desktop::clear()
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err(AppError::Other(MOBILE_MSG.into()))
    }
}
