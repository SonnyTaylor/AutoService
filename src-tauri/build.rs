use std::{env, fs, path::PathBuf, process::Command};

// Include the project's path helpers so the build script and runtime use the
// same logic for locating the `data` folder. The file `src/paths.rs` is
// included into a module so we can call its functions here.
mod paths {
    include!("src/paths.rs");
}

// Easy-to-change constants for where the generated Python executable is placed
// and what it is named. Change these to control the target location or name
// without digging through the build logic.
const PYTHON_RUNNER_STEM: &str = "service_runner"; // PyInstaller --name
const PYTHON_RUNNER_EXE_NAME: &str = "service_runner.exe"; // final exe name in bin dir
const PYTHON_COMMAND: &str = "python"; // program used to invoke PyInstaller

fn main() {
    // Ensure a platform-suffixed copy of the external binary exists
    // before calling into `tauri_build::build()` — the bundler checks
    // for files like `binaries/service_runner.exe-<target>.exe` while
    // building and will fail early if they don't exist.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    let bin_dir = repo_root.join("binaries");
    let original_exe = bin_dir.join(PYTHON_RUNNER_EXE_NAME);

    // Diagnostic info to help when the expected files are not found during CI
    println!(
        "cargo:warning=build.rs manifest_dir={}",
        manifest_dir.display()
    );
    println!("cargo:warning=build.rs repo_root={}", repo_root.display());
    println!("cargo:warning=build.rs bin_dir={}", bin_dir.display());
    println!(
        "cargo:warning=build.rs expected_original_exe={}",
        original_exe.display()
    );
    println!(
        "cargo:warning=build.rs original_exe_exists={}",
        original_exe.exists()
    );
    println!("cargo:warning=build.rs TARGET_env={:?}", env::var("TARGET"));

    // Also ensure a copy exists inside the `src-tauri/binaries` folder
    // because the tauri bundler resolves resource paths relative to the
    // manifest directory (src-tauri) when validating `externalBin`.
    let manifest_bin_dir = manifest_dir.join("binaries");
    if let Ok(target_triple) = env::var("TARGET") {
        let suffixed_name = format!("{}-{}.exe", PYTHON_RUNNER_EXE_NAME, target_triple);
        let source_suffixed = bin_dir.join(&suffixed_name);
        let dest_suffixed = manifest_bin_dir.join(&suffixed_name);
        if source_suffixed.exists() {
            if let Err(e) = fs::create_dir_all(&manifest_bin_dir) {
                println!(
                    "cargo:warning=Failed to create manifest binaries dir {}: {}",
                    manifest_bin_dir.display(),
                    e
                );
            }
            match fs::copy(&source_suffixed, &dest_suffixed) {
                Ok(_) => println!(
                    "cargo:warning=Copied {} -> {}",
                    source_suffixed.display(),
                    dest_suffixed.display()
                ),
                Err(e) => println!(
                    "cargo:warning=Failed to copy {} -> {}: {}",
                    source_suffixed.display(),
                    dest_suffixed.display(),
                    e
                ),
            }
        } else {
            println!("cargo:warning=Source suffixed binary {} does not exist yet; it will be created later if PyInstaller runs", source_suffixed.display());
        }
    }
    if original_exe.exists() {
        if let Ok(target_triple) = env::var("TARGET") {
            let suffixed_name = format!("{}-{}.exe", PYTHON_RUNNER_EXE_NAME, target_triple);
            let suffixed_path = bin_dir.join(&suffixed_name);
            if !suffixed_path.exists() {
                if let Err(e) = fs::create_dir_all(&bin_dir) {
                    println!(
                        "cargo:warning=Failed to create binaries dir {}: {}",
                        bin_dir.display(),
                        e
                    );
                }
                match fs::copy(&original_exe, &suffixed_path) {
                    Ok(_) => println!(
                        "cargo:warning=Created platform-specific binary copy {}",
                        suffixed_path.display()
                    ),
                    Err(e) => println!(
                        "cargo:warning=Failed to create platform-specific copy {}: {}",
                        suffixed_path.display(),
                        e
                    ),
                }
            }
        } else {
            println!("cargo:warning=TARGET env var not set; skipping creation of platform-specific binary copy");
        }
    }

    // Let Tauri's build steps run as usual.
    tauri_build::build();

    // Resolve data directory using the same logic as the runtime.
    let data_root: PathBuf = paths::resolve_data_dir();

    // Ensure standard data subdirectories exist (reports, programs, settings, resources)
    if let Err(e) = paths::ensure_structure(&data_root) {
        println!("cargo:warning=Failed to ensure data structure: {}", e);
        // don't fail the build; continue and try to create the bin dir below
    }

    // Locate the repository root so the compiled Python runner can be placed in
    // <repo root>/binaries instead of inside the data/resources tree. This keeps
    // build artifacts at the repository top level and avoids modifying the data
    // directory during a cargo build.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();

    // Prefer repo-root /binaries for compiled Python runner to avoid writing
    // build artefacts into the source tree used at runtime.
    let bin_dir = repo_root.join("binaries");
    if let Err(e) = fs::create_dir_all(&bin_dir) {
        println!(
            "cargo:warning=Failed to create binaries directory {}: {}",
            bin_dir.display(),
            e
        );
        return; // nothing more we can do
    }

    // Locate the Python source file in the repository: <repo root>/runner/service_runner.py
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
    let target_exe = bin_dir.join(PYTHON_RUNNER_EXE_NAME);
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

    // Choose PyInstaller work and spec paths inside the Cargo OUT_DIR so
    // PyInstaller doesn't write build artifacts into the source tree
    // (which would cause cargo to repeatedly detect changes and rebuild).
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(v) => PathBuf::from(v),
        Err(_) => bin_dir.clone(),
    };

    let workpath = out_dir.join("pyinstaller_work");
    let specpath = out_dir.join("pyinstaller_spec");

    if let Err(e) = fs::create_dir_all(&workpath) {
        println!(
            "cargo:warning=Failed to create pyinstaller workpath {}: {}",
            workpath.display(),
            e
        );
    }
    if let Err(e) = fs::create_dir_all(&specpath) {
        println!(
            "cargo:warning=Failed to create pyinstaller specpath {}: {}",
            specpath.display(),
            e
        );
    }

    let workpath_str = workpath.to_str().unwrap_or(bin_dir_str);
    let specpath_str = specpath.to_str().unwrap_or(bin_dir_str);

    let status = Command::new(PYTHON_COMMAND)
        .arg("-m")
        .arg("PyInstaller")
        .arg("--onefile")
        .arg("--noconfirm")
        .arg("--distpath")
        .arg(bin_dir_str)
        .arg("--workpath")
        .arg(workpath_str)
        .arg("--specpath")
        .arg(specpath_str)
        .arg("--name")
        .arg(PYTHON_RUNNER_STEM)
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

    // Create a platform-suffixed copy so Tauri's bundler can find the
    // expected resource path. When an external binary is declared as
    // `binaries/service_runner.exe` the bundler looks for a file named
    // `service_runner.exe-<target-triple>.exe` (for example
    // service_runner.exe-x86_64-pc-windows-msvc.exe). Ensure that copy
    // exists by duplicating the created exe if present.
    if target_exe.exists() {
        match env::var("TARGET") {
            Ok(target_triple) => {
                let suffixed_name = format!("{}-{}.exe", PYTHON_RUNNER_EXE_NAME, target_triple);
                let suffixed_path = bin_dir.join(&suffixed_name);
                if let Err(e) = fs::copy(&target_exe, &suffixed_path) {
                    println!(
                        "cargo:warning=Failed to create platform-specific copy {}: {}",
                        suffixed_path.display(),
                        e
                    );
                } else {
                    println!(
                        "cargo:warning=Created platform-specific binary copy {}",
                        suffixed_path.display()
                    );
                }
            }
            Err(_) => {
                println!("cargo:warning=TARGET env var not set; skipping creation of platform-specific binary copy");
            }
        }
    }
}
