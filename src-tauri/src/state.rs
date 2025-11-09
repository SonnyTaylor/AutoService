use std::sync::Arc;
use std::sync::Mutex;
use std::process::Child;

#[derive(Clone)]
pub struct AppState {
    pub data_dir: Arc<std::path::PathBuf>,
    pub control_file_path: Arc<Mutex<Option<std::path::PathBuf>>>,
    pub runner_process: Arc<Mutex<Option<Child>>>,
}
