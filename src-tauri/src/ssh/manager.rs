use crate::error::{AppError, AppResult};
use crate::ssh::session::Session;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
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
    // SessionManager tests that insert sessions require a real Session, which is
    // only constructible through async network setup. The real path is covered
    // by the gated integration test in tests/integration_ssh.rs.
}
