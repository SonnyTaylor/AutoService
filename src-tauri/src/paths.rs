use std::{env, path::{Path, PathBuf}};

fn exists_dir(p: &Path) -> bool { p.is_dir() }

pub fn resolve_data_dir() -> PathBuf {
    // 1) Environment override (works for dev and prod)
    if let Some(val) = env::var_os("AUTOSERVICE_DATA_DIR") {
        let p = PathBuf::from(val);
        if exists_dir(&p) { return p; }
    }

    // 2) Sibling 'data' folder next to executable (USB deployment)
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("data");
            if exists_dir(&p) { return p; }
        }
    }

    // 3) Dev fallback: repo root data folder (src-tauri is one level below root)
    // CARGO_MANIFEST_DIR resolves to the src-tauri directory at compile time.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(root) = manifest_dir.parent() {
        let p = root.join("data");
        return p; // create later if missing
    }

    // 4) Last resort: current dir /data
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("data")
}

pub fn subdirs(data_root: &Path) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    (
        data_root.join("reports"),
        data_root.join("programs"),
        data_root.join("settings"),
        data_root.join("resources"),
    )
}

pub fn ensure_structure(data_root: &Path) -> std::io::Result<()> {
    let (reports, programs, settings, resources) = subdirs(data_root);
    std::fs::create_dir_all(&reports)?;
    std::fs::create_dir_all(&programs)?;
    std::fs::create_dir_all(&settings)?;
    std::fs::create_dir_all(&resources)?;
    Ok(())
}
