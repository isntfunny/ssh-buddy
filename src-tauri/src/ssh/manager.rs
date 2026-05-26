use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use crate::error::{AppError, AppResult};

/// A handle to an active SSH session. Real implementation lands in Task 18.
#[derive(Debug)]
pub struct Session {
    pub id: String,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self { sessions: Mutex::new(HashMap::new()) }
    }

    pub fn insert(&self, session: Session) -> Arc<Session> {
        let arc = Arc::new(session);
        self.sessions.lock().insert(arc.id.clone(), arc.clone());
        arc
    }

    pub fn get(&self, id: &str) -> AppResult<Arc<Session>> {
        self.sessions
            .lock()
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::SessionNotFound(id.to_string()))
    }

    pub fn remove(&self, id: &str) -> AppResult<Arc<Session>> {
        self.sessions
            .lock()
            .remove(id)
            .ok_or_else(|| AppError::SessionNotFound(id.to_string()))
    }

    pub fn ids(&self) -> Vec<String> {
        self.sessions.lock().keys().cloned().collect()
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk(id: &str) -> Session {
        Session { id: id.to_string() }
    }

    #[test]
    fn starts_empty() {
        let m = SessionManager::new();
        assert!(m.ids().is_empty());
    }

    #[test]
    fn insert_then_get() {
        let m = SessionManager::new();
        m.insert(mk("a"));
        let got = m.get("a").unwrap();
        assert_eq!(got.id, "a");
    }

    #[test]
    fn get_missing_returns_error() {
        let m = SessionManager::new();
        let err = m.get("missing").unwrap_err();
        assert!(matches!(err, AppError::SessionNotFound(_)));
    }

    #[test]
    fn remove_then_gone() {
        let m = SessionManager::new();
        m.insert(mk("a"));
        m.remove("a").unwrap();
        assert!(m.get("a").is_err());
    }

    #[test]
    fn ids_returns_all() {
        let m = SessionManager::new();
        m.insert(mk("a"));
        m.insert(mk("b"));
        let mut ids = m.ids();
        ids.sort();
        assert_eq!(ids, vec!["a", "b"]);
    }
}
