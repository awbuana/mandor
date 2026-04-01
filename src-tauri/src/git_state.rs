use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct GitState {
    locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
}

impl GitState {
    pub fn new() -> Self {
        Self {
            locks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_lock(&self, worktree_path: &str) -> Arc<Mutex<()>> {
        let mut locks = self.locks.lock().await;
        locks.entry(worktree_path.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

impl Default for GitState {
    fn default() -> Self {
        Self::new()
    }
}