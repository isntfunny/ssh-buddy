use std::collections::HashMap;
use std::path::PathBuf;

use crate::error::{AppError, AppResult};

pub enum HostKeyStatus {
    New,
    Trusted,
    Changed { expected: String },
}

pub struct KnownHostsStore {
    path: PathBuf,
}

impl KnownHostsStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn load(&self) -> AppResult<HashMap<String, String>> {
        if !self.path.exists() {
            return Ok(HashMap::new());
        }
        let content = std::fs::read_to_string(&self.path)
            .map_err(|e| AppError::Other(e.to_string()))?;
        serde_json::from_str(&content).map_err(|e| AppError::Other(e.to_string()))
    }

    fn save(&self, data: &HashMap<String, String>) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AppError::Other(e.to_string()))?;
        }
        let content =
            serde_json::to_string_pretty(data).map_err(|e| AppError::Other(e.to_string()))?;
        std::fs::write(&self.path, content).map_err(|e| AppError::Other(e.to_string()))
    }

    fn host_key(host: &str, port: u16) -> String {
        format!("[{host}]:{port}")
    }

    pub fn check(&self, host: &str, port: u16, fingerprint: &str) -> AppResult<HostKeyStatus> {
        let hosts = self.load()?;
        let key = Self::host_key(host, port);
        Ok(match hosts.get(&key) {
            None => HostKeyStatus::New,
            Some(fp) if fp == fingerprint => HostKeyStatus::Trusted,
            Some(fp) => HostKeyStatus::Changed {
                expected: fp.clone(),
            },
        })
    }

    pub fn record(&self, host: &str, port: u16, fingerprint: &str) -> AppResult<()> {
        let mut hosts = self.load()?;
        hosts.insert(Self::host_key(host, port), fingerprint.to_string());
        self.save(&hosts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn store(dir: &std::path::Path) -> KnownHostsStore {
        KnownHostsStore::new(dir.join("known_hosts.json"))
    }

    #[test]
    fn new_host_returns_new() {
        let dir = tempdir().unwrap();
        let s = store(dir.path());
        let status = s.check("host.example", 22, "SHA256:abc").unwrap();
        assert!(matches!(status, HostKeyStatus::New));
    }

    #[test]
    fn recorded_host_returns_trusted() {
        let dir = tempdir().unwrap();
        let s = store(dir.path());
        s.record("host.example", 22, "SHA256:abc").unwrap();
        let status = s.check("host.example", 22, "SHA256:abc").unwrap();
        assert!(matches!(status, HostKeyStatus::Trusted));
    }

    #[test]
    fn changed_fingerprint_returns_changed() {
        let dir = tempdir().unwrap();
        let s = store(dir.path());
        s.record("host.example", 22, "SHA256:abc").unwrap();
        let status = s.check("host.example", 22, "SHA256:xyz").unwrap();
        match status {
            HostKeyStatus::Changed { expected } => assert_eq!(expected, "SHA256:abc"),
            _ => panic!("expected Changed"),
        }
    }

    #[test]
    fn different_ports_are_separate_entries() {
        let dir = tempdir().unwrap();
        let s = store(dir.path());
        s.record("host.example", 22, "SHA256:abc").unwrap();
        let status = s.check("host.example", 2222, "SHA256:abc").unwrap();
        assert!(matches!(status, HostKeyStatus::New));
    }
}
