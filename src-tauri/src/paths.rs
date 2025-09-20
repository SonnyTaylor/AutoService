/// Data directory resolution utilities for Autoservice.
///
/// Autoservice is designed to run from a USB drive alongside a `data` folder.
/// This module provides helper functions to resolve the correct data path,
/// create required subdirectories, and ensure a consistent file structure
/// across development and deployment environments.
use std::{
    env,
    path::{Path, PathBuf},
};

/// Checks whether a path exists and is a directory.
fn exists_dir(p: &Path) -> bool {
    p.is_dir()
}

/// Resolves the location of the `data` directory for Autoservice.
///
/// Resolution order:
/// 1. **Environment variable override** via `AUTOSERVICE_DATA_DIR`.
///    - Useful for both dev and prod custom setups.
/// 2. **Sibling `data` folder** located next to the executable.
///    - Default deployment mode when running from a USB.
/// 3. **Dev fallback**: repo root `data` folder.
///    - Uses `CARGO_MANIFEST_DIR` (which points to `src-tauri`).
/// 4. **Last resort**: `./data` under the current working directory.
///
/// # Returns
/// A [`PathBuf`] pointing to the resolved `data` directory.
/// The directory may not exist yet — creation is handled separately.
pub fn resolve_data_dir() -> PathBuf {
    // 1) Environment override (works for dev and prod)
    if let Some(val) = env::var_os("AUTOSERVICE_DATA_DIR") {
        let p = PathBuf::from(val);
        if exists_dir(&p) {
            return p;
        }
    }

    // 2) Sibling 'data' folder next to executable (USB deployment)
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("data");
            if exists_dir(&p) {
                return p;
            }
        }
    }

    // 3) Dev fallback: repo root data folder (src-tauri is one level below root).
    // CARGO_MANIFEST_DIR resolves to the src-tauri directory at compile time.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(root) = manifest_dir.parent() {
        let p = root.join("data");
        return p; // may not exist yet — handled later
    }

    // 4) Last resort: current dir /data
    env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("data")
}

/// Returns the standard subdirectory structure under the `data` root.
///
/// - `reports`  
/// - `programs`  
/// - `settings`  
/// - `resources`
///
/// This tuple is mainly used when ensuring the directory structure.
pub fn subdirs(data_root: &Path) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    (
        data_root.join("reports"),
        data_root.join("programs"),
        data_root.join("settings"),
        data_root.join("resources"),
    )
}

/// Ensures that the required subdirectory structure exists under `data_root`.
///
/// Creates the following directories if missing:
/// - `reports`
/// - `programs`
/// - `settings`
/// - `resources`
///
/// # Errors
/// Returns an [`std::io::Error`] if directory creation fails.
pub fn ensure_structure(data_root: &Path) -> std::io::Result<()> {
    let (reports, programs, settings, resources) = subdirs(data_root);
    std::fs::create_dir_all(&reports)?;
    std::fs::create_dir_all(&programs)?;
    std::fs::create_dir_all(&settings)?;
    std::fs::create_dir_all(&resources)?;
    Ok(())
}
