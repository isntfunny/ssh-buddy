use async_trait::async_trait;
use russh::client::{self, Handle};
use russh::keys::decode_secret_key;
use russh::keys::key;
use russh::{ChannelMsg, Disconnect};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub enum AuthMethod {
    Password(String),
    PrivateKey {
        pem: String,
        passphrase: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    pub initial_cols: u32,
    pub initial_rows: u32,
}

struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // MVP: trust on first sight. TOFU + known_hosts persistence lands in a later plan.
        Ok(true)
    }
}

/// A handle to one connected SSH session with an open shell channel.
pub struct Session {
    pub id: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
    control_tx: mpsc::Sender<ChannelCommand>,
    done_rx: Mutex<oneshot::Receiver<()>>,
}

pub struct OpenOutcome {
    pub session: Session,
    /// Stream of bytes coming back from the SSH server.
    pub output_rx: mpsc::Receiver<Vec<u8>>,
}

enum ChannelCommand {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

impl Session {
    pub async fn open(id: String, params: ConnectParams) -> AppResult<OpenOutcome> {
        let config = Arc::new(client::Config::default());
        let addrs = (params.host.as_str(), params.port);
        let handler = ClientHandler;
        let mut handle = client::connect(config, addrs, handler).await?;

        let auth_ok = match params.auth {
            AuthMethod::Password(ref pw) => {
                handle.authenticate_password(&params.username, pw).await?
            }
            AuthMethod::PrivateKey {
                ref pem,
                ref passphrase,
            } => {
                let key = decode_secret_key(pem, passphrase.as_deref())
                    .map_err(|e| AppError::Ssh(format!("Key parse error: {e}")))?;
                handle
                    .authenticate_publickey(&params.username, Arc::new(key))
                    .await?
            }
        };
        if !auth_ok {
            return Err(AppError::AuthFailed);
        }

        let channel = handle.channel_open_session().await?;
        channel
            .request_pty(
                false,
                "xterm-256color",
                params.initial_cols,
                params.initial_rows,
                0,
                0,
                &[],
            )
            .await?;
        channel.request_shell(false).await?;

        let (tx, output_rx) = mpsc::channel::<Vec<u8>>(64);
        let (control_tx, mut control_rx) = mpsc::channel::<ChannelCommand>(64);
        let (done_tx, done_rx) = oneshot::channel::<()>();

        let session = Session {
            id: id.clone(),
            handle: Arc::new(Mutex::new(handle)),
            control_tx,
            done_rx: Mutex::new(done_rx),
        };

        // The reader task owns the channel so input and resize commands can be
        // selected alongside server output without holding a mutex across wait().
        tokio::spawn(async move {
            let mut channel = channel;
            loop {
                tokio::select! {
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) => {
                                if tx.send(data.to_vec()).await.is_err() {
                                    break;
                                }
                            }
                            Some(ChannelMsg::ExtendedData { data, .. }) => {
                                if tx.send(data.to_vec()).await.is_err() {
                                    break;
                                }
                            }
                            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                            Some(_) => continue,
                        }
                    }
                    command = control_rx.recv() => {
                        match command {
                            Some(ChannelCommand::Data(data)) => {
                                if channel.data(std::io::Cursor::new(data)).await.is_err() {
                                    break;
                                }
                            }
                            Some(ChannelCommand::Resize { cols, rows }) => {
                                if channel.window_change(cols, rows, 0, 0).await.is_err() {
                                    break;
                                }
                            }
                            Some(ChannelCommand::Close) => {
                                let _ = channel.close().await;
                                break;
                            }
                            None => break,
                        }
                    }
                }
            }
            let _ = done_tx.send(());
        });

        Ok(OpenOutcome { session, output_rx })
    }

    pub async fn send_input(&self, bytes: &[u8]) -> AppResult<()> {
        self.control_tx
            .send(ChannelCommand::Data(bytes.to_vec()))
            .await
            .map_err(|_| AppError::Other("SSH channel is closed".into()))
    }

    pub async fn resize(&self, cols: u32, rows: u32) -> AppResult<()> {
        self.control_tx
            .send(ChannelCommand::Resize { cols, rows })
            .await
            .map_err(|_| AppError::Other("SSH channel is closed".into()))
    }

    pub async fn close(&self) -> AppResult<()> {
        let send_ok = self.control_tx.send(ChannelCommand::Close).await.is_ok();
        if send_ok {
            // Wait for pump task to finish before disconnecting the handle
            let mut rx = self.done_rx.lock().await;
            let _ = (&mut *rx).await;
            let handle = self.handle.lock().await;
            handle
                .disconnect(Disconnect::ByApplication, "user requested", "en")
                .await?;
        }
        Ok(())
    }
}
