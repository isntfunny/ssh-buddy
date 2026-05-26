use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::ssh::known_hosts::{HostKeyStatus, KnownHostsStore};
use crate::ssh::manager::SessionManager;
use crate::ssh::session::{AuthMethod, ConnectParams, Session};

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WireAuth {
    Password {
        password: String,
    },
    PrivateKey {
        pem: String,
        passphrase: Option<String>,
    },
}

impl From<WireAuth> for AuthMethod {
    fn from(wire: WireAuth) -> Self {
        match wire {
            WireAuth::Password { password } => AuthMethod::Password(password),
            WireAuth::PrivateKey { pem, passphrase } => AuthMethod::PrivateKey { pem, passphrase },
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: WireAuth,
    pub initial_cols: u32,
    pub initial_rows: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutputEvent {
    pub session_id: String,
    pub bytes: Vec<u8>,
}

/// Returned to the frontend so it knows whether to show a TOFU warning.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ConnectOutcome {
    /// Host key is already trusted.
    Connected {
        session_id: String,
        fingerprint: String,
    },
    /// Host key has never been seen — frontend must ask user to trust or reject.
    NewHostKey {
        session_id: String,
        fingerprint: String,
    },
}

fn start_output_pump(
    app: AppHandle,
    session_id: String,
    mut rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
) {
    tauri::async_runtime::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            let _ = app.emit(
                &format!("ssh:output:{session_id}"),
                OutputEvent {
                    session_id: session_id.clone(),
                    bytes,
                },
            );
        }
        let _ = app.emit(&format!("ssh:closed:{session_id}"), ());
    });
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    known_hosts: State<'_, KnownHostsStore>,
    request: ConnectRequest,
) -> AppResult<ConnectOutcome> {
    let id = Uuid::new_v4().to_string();
    let params = ConnectParams {
        host: request.host.clone(),
        port: request.port,
        username: request.username,
        auth: request.auth.into(),
        initial_cols: request.initial_cols,
        initial_rows: request.initial_rows,
    };
    let outcome = Session::open(id.clone(), params).await?;
    let fingerprint = outcome.session.fingerprint.clone();

    match known_hosts.check(&request.host, request.port, &fingerprint)? {
        HostKeyStatus::Changed { expected } => {
            outcome.session.close().await.ok();
            Err(AppError::Ssh(format!(
                "Host key changed! Expected {expected}, got {fingerprint}. Aborting — possible MITM."
            )))
        }
        HostKeyStatus::Trusted => {
            manager.insert(outcome.session);
            start_output_pump(app, id.clone(), outcome.output_rx);
            Ok(ConnectOutcome::Connected {
                session_id: id,
                fingerprint,
            })
        }
        HostKeyStatus::New => {
            manager.insert(outcome.session);
            start_output_pump(app, id.clone(), outcome.output_rx);
            Ok(ConnectOutcome::NewHostKey {
                session_id: id,
                fingerprint,
            })
        }
    }
}

#[tauri::command]
pub async fn ssh_trust_host_key(
    known_hosts: State<'_, KnownHostsStore>,
    host: String,
    port: u16,
    fingerprint: String,
) -> AppResult<()> {
    known_hosts.record(&host, port, &fingerprint)
}

#[tauri::command]
pub async fn ssh_reject_host_key(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> AppResult<()> {
    let session = manager.remove(&session_id)?;
    session.close().await
}

#[tauri::command]
pub async fn ssh_send_input(
    manager: State<'_, SessionManager>,
    session_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let session = manager.get(&session_id)?;
    session.send_input(&data).await
}

#[tauri::command]
pub async fn ssh_resize(
    manager: State<'_, SessionManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let session = manager.get(&session_id)?;
    session.resize(cols, rows).await
}

#[tauri::command]
pub async fn ssh_disconnect(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> AppResult<()> {
    let session = manager.remove(&session_id)?;
    session.close().await
}

#[tauri::command]
pub async fn ssh_validate_private_key(
    pem: String,
    passphrase: Option<String>,
) -> AppResult<String> {
    use russh::keys::decode_secret_key;
    decode_secret_key(&pem, passphrase.as_deref())
        .map_err(|e| AppError::Ssh(format!("Key parse error: {e}")))?;
    Ok("Key is valid".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn validate_private_key_rejects_invalid_pem() {
        let result = ssh_validate_private_key("not-a-key".into(), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn validate_private_key_rejects_empty() {
        let result = ssh_validate_private_key(String::new(), None).await;
        assert!(result.is_err());
    }
}
