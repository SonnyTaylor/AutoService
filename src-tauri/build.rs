use std::{env, fs, path::PathBuf, process::Command};

// Include the project's path helpers so the build script and runtime use the
// same logic for locating the `data` folder. The file `src/paths.rs` is
// included into a module so we can call its functions here.
mod paths {
    include!("src/paths.rs");
}

fn main() {
    // Let Tauri's build steps run as usual.
    tauri_build::build();

    // Resolve data directory using the same logic as the runtime.
    let data_root: PathBuf = paths::resolve_data_dir();

    // Ensure standard data subdirectories exist (reports, programs, settings, resources)
    if let Err(e) = paths::ensure_structure(&data_root) {
        println!("cargo:warning=Failed to ensure data structure: {}", e);
        // don't fail the build; continue and try to create the bin dir below
    }

    // Build path to data/resources/bin
    let (_reports, _programs, _settings, resources) = paths::subdirs(&data_root);
    let bin_dir = resources.join("bin");
    if let Err(e) = fs::create_dir_all(&bin_dir) {
        println!(
            "cargo:warning=Failed to create bin directory {}: {}",
            bin_dir.display(),
            e
        );
        return; // nothing more we can do
    }

    // Locate the Python source file in the repository: <repo root>/runner/service_runner.py
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    let py_src = repo_root.join("runner").join("service_runner.py");

    if !py_src.exists() {
        println!(
            "cargo:warning=Python source not found at {} - skipping PyInstaller step",
            py_src.display()
        );
        return;
    }

    // Target executable path in the bin folder. We'll remove it first so the
    // new build effectively overwrites the previous one.
    let target_exe = bin_dir.join("service_runner.exe");
    if target_exe.exists() {
        if let Err(e) = fs::remove_file(&target_exe) {
            println!(
                "cargo:warning=Failed to remove existing {}: {}",
                target_exe.display(),
                e
            );
            // continue and let PyInstaller try to overwrite
        }
    }

    // Run PyInstaller via `python -m PyInstaller` so it's more likely to work
    // across environments. Use --onefile and set the distpath to the bin dir.
    // We don't fail the build if PyInstaller isn't available; we emit a warning
    // so local development can continue.
    let bin_dir_str = match bin_dir.to_str() {
        Some(s) => s,
        None => {
            println!(
                "cargo:warning=Bin dir path contains invalid UTF-8: {}",
                bin_dir.display()
            );
            return;
        }
    };

    println!(
        "cargo:warning=Running PyInstaller to build {} -> {}",
        py_src.display(),
        bin_dir.display()
    );

    let status = Command::new("python")
        .arg("-m")
        .arg("PyInstaller")
        .arg("--onefile")
        .arg("--noconfirm")
        .arg("--distpath")
        .arg(bin_dir_str)
        .arg("--name")
        .arg("service_runner")
        .arg(py_src.to_str().unwrap())
        .status();

    match status {
        Ok(s) if s.success() => {
            println!(
                "cargo:warning=PyInstaller finished successfully; created {}",
                target_exe.display()
            );
        }
        Ok(s) => {
            println!("cargo:warning=PyInstaller exited with status {} - executable may not have been created", s);
        }
        Err(e) => {
            println!("cargo:warning=Failed to execute PyInstaller (is Python/pyinstaller installed?): {}", e);
        }
    }
}
