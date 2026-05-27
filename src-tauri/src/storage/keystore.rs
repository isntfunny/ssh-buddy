use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "ssh-buddy";
const ACCOUNT: &str = "master-key";

fn entry() -> AppResult<Entry> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn storage_store_key(key: Vec<u8>) -> AppResult<()> {
    let hex: String = key.iter().map(|b| format!("{b:02x}")).collect();
    entry()?.set_password(&hex).map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn storage_load_key() -> AppResult<Option<Vec<u8>>> {
    match entry()?.get_password() {
        Ok(hex) => {
            let bytes = (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Other(format!("key decode: {e}")))?;
            Ok(Some(bytes))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Other(e.to_string())),
    }
}

#[tauri::command]
pub async fn storage_clear_key() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Other(e.to_string())),
    }
}
