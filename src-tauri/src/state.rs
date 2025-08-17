use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub data_dir: Arc<std::path::PathBuf>,
}
