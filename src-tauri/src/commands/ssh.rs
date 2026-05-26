// Stub — implementation follows in Task 19
use crate::error::AppResult;
use crate::ssh::manager::SessionManager;
use tauri::State;

#[tauri::command]
pub async fn ssh_connect(
    _manager: State<'_, SessionManager>,
) -> AppResult<String> {
    Err(crate::error::AppError::Other("not yet implemented".into()))
}

#[tauri::command]
pub async fn ssh_send_input(
    _manager: State<'_, SessionManager>,
    _session_id: String,
    _data: Vec<u8>,
) -> AppResult<()> {
    Err(crate::error::AppError::Other("not yet implemented".into()))
}

#[tauri::command]
pub async fn ssh_resize(
    _manager: State<'_, SessionManager>,
    _session_id: String,
    _cols: u32,
    _rows: u32,
) -> AppResult<()> {
    Err(crate::error::AppError::Other("not yet implemented".into()))
}

#[tauri::command]
pub async fn ssh_disconnect(
    _manager: State<'_, SessionManager>,
    _session_id: String,
) -> AppResult<()> {
    Err(crate::error::AppError::Other("not yet implemented".into()))
}
