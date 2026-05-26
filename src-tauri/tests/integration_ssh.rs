use ssh_buddy_lib::ssh::session::{AuthMethod, ConnectParams, Session};
use std::env;
use std::time::Duration;
use tokio::time::timeout;

fn skip_if_not_enabled() -> bool {
    env::var("SSH_BUDDY_INTEGRATION").is_err()
}

fn params() -> ConnectParams {
    ConnectParams {
        host: env::var("SSH_BUDDY_TEST_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port: env::var("SSH_BUDDY_TEST_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(2222),
        username: env::var("SSH_BUDDY_TEST_USER").unwrap_or_else(|_| "testuser".into()),
        auth: AuthMethod::Password(
            env::var("SSH_BUDDY_TEST_PASSWORD").unwrap_or_else(|_| "testpass".into()),
        ),
        initial_cols: 80,
        initial_rows: 24,
    }
}

#[tokio::test]
async fn connect_and_run_command() {
    if skip_if_not_enabled() {
        eprintln!("SKIPPED: set SSH_BUDDY_INTEGRATION=1 to run");
        return;
    }

    let mut outcome = Session::open("test".into(), params()).await.expect("open");

    outcome
        .session
        .send_input(b"echo hello && exit\n")
        .await
        .expect("send");

    let mut accumulated = Vec::new();
    let read_some = async {
        while let Some(bytes) = outcome.output_rx.recv().await {
            accumulated.extend_from_slice(&bytes);
            if accumulated.windows(5).any(|w| w == b"hello") {
                return Ok::<(), &'static str>(());
            }
        }
        Err("channel closed before 'hello' seen")
    };

    timeout(Duration::from_secs(5), read_some)
        .await
        .expect("timeout")
        .expect("expected output");

    outcome.session.close().await.ok();
}
