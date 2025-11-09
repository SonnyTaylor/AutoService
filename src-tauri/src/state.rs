use std::sync::Arc;
use std::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub data_dir: Arc<std::path::PathBuf>,
    pub control_file_path: Arc<Mutex<Option<std::path::PathBuf>>>,
}
