pub mod commands;
pub mod error;
pub mod ssh;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .setup(|app| {
            let app_dir = app
                .path()
                .app_local_data_dir()
                .expect("failed to resolve app data dir");
            let known_hosts_path = app_dir.join("known_hosts.json");
            app.manage(ssh::known_hosts::KnownHostsStore::new(known_hosts_path));
            Ok(())
        })
        .manage(ssh::manager::SessionManager::new())
        .manage(commands::ssh::PendingPumps::default())
        .invoke_handler(tauri::generate_handler![
            commands::ssh::ssh_connect,
            commands::ssh::ssh_start_output,
            commands::ssh::ssh_send_input,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_disconnect,
            commands::ssh::ssh_validate_private_key,
            commands::ssh::ssh_trust_host_key,
            commands::ssh::ssh_reject_host_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
