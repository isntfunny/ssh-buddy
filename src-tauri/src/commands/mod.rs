pub mod ssh;

pub use crate::storage::keystore::{storage_clear_key, storage_load_key, storage_store_key};

/// Target OS, used by the frontend to route platform-specific behaviour
/// (e.g. mobile uses the biometry plugin for key storage, desktop uses keyring).
#[tauri::command]
pub fn app_platform() -> &'static str {
    std::env::consts::OS
}
