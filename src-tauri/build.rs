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
    println!("cargo:warning=build.rs STARTING EXECUTION");
    // Ensure cargo rebuilds when the runner or its services change
    println!("cargo:rerun-if-changed=../runner/service_runner.py");
    println!("cargo:rerun-if-changed=../runner/sentry_config.py");
    // Watch all service modules (shallow) – if this becomes too broad we can refine
    if let Ok(read_dir) = std::fs::read_dir("../runner/services") {
        for entry in read_dir.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_file() {
                    println!(
                        "cargo:rerun-if-changed=../runner/services/{}",
                        entry.file_name().to_string_lossy()
                    );
                }
            }
        }
    }

    // Resolve manifest and repository roots for diagnostics
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    println!(
        "cargo:warning=build.rs manifest_dir={}",
        manifest_dir.display()
    );
    println!("cargo:warning=build.rs repo_root={}", repo_root.display());
    println!("cargo:warning=build.rs TARGET_env={:?}", env::var("TARGET"));
    println!(
        "cargo:warning=build.rs Current working directory: {:?}",
        std::env::current_dir()
    );

    // Let Tauri's build steps run as usual.
    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(
        r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
        <requestedPrivileges>
            <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
        </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#,
    );
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run build script");

    // Resolve data directory using the same logic as the runtime.
    let data_root: PathBuf = paths::resolve_data_dir();

    // Ensure standard data subdirectories exist (reports, programs, settings, resources)
    if let Err(e) = paths::ensure_structure(&data_root) {
        println!("cargo:warning=Failed to ensure data structure: {}", e);
        // don't fail the build; continue and try to create the bin dir below
    }

    // We now build the Python runner directly into the resolved data/resources/bin folder
    // so the runtime can spawn it without sidecar registration. In dev, the resolved path
    // may differ from the repository root data folder (e.g. if AUTOSERVICE_DATA_DIR is set
    // or executable path heuristics change). To guarantee the developer sees the binary in
    // the repo `data/resources/bin`, we also mirror/copy the built exe there when different.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    let bin_dir = data_root.join("resources").join("bin");
    let repo_data_bin = repo_root.join("data").join("resources").join("bin");
    if let Err(e) = fs::create_dir_all(&bin_dir) {
        println!(
            "cargo:warning=Failed to create binaries directory {}: {}",
            bin_dir.display(),
            e
        );
        return; // nothing more we can do
    }
    if bin_dir != repo_data_bin {
        if let Err(e) = fs::create_dir_all(&repo_data_bin) {
            println!(
                "cargo:warning=Failed to create repo data bin {}: {}",
                repo_data_bin.display(),
                e
            );
        }
    }

    // Locate the Python source file in the repository: <repo root>/runner/service_runner.py
    let py_src = repo_root.join("runner").join("service_runner.py");

    println!(
        "cargo:warning=Checking Python source file: {}",
        py_src.display()
    );
    println!(
        "cargo:warning=Python source file exists: {}",
        py_src.exists()
    );

    if !py_src.exists() {
        println!(
            "cargo:warning=Python source not found at {} - skipping PyInstaller step",
            py_src.display()
        );
        // List contents of runner directory to help debug
        let runner_dir = repo_root.join("runner");
        if runner_dir.exists() {
            println!("cargo:warning=Contents of runner directory:");
            if let Ok(entries) = fs::read_dir(&runner_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        println!("cargo:warning=  {}", entry.path().display());
                    }
                }
            }
        }
        return;
    }

    // Check if the file is readable
    match fs::metadata(&py_src) {
        Ok(metadata) => {
            println!(
                "cargo:warning=Python source file size: {} bytes",
                metadata.len()
            );
        }
        Err(e) => {
            println!(
                "cargo:warning=Failed to read Python source file metadata: {}",
                e
            );
            return;
        }
    }

    // Target executable path in the bin folder. We'll remove it first so the
    // new build effectively overwrites the previous one.
    let target_exe = bin_dir.join(PYTHON_RUNNER_EXE_NAME);
    let mirror_exe = repo_data_bin.join(PYTHON_RUNNER_EXE_NAME);

    println!("cargo:warning=Target executable: {}", target_exe.display());
    println!(
        "cargo:warning=Target executable exists: {}",
        target_exe.exists()
    );
    println!("cargo:warning=Mirror exe path: {}", mirror_exe.display());
    println!("cargo:warning=Mirror exe exists: {}", mirror_exe.exists());

    // Helper: get latest modification time among a list of files
    fn latest_mtime(paths: &[PathBuf]) -> std::time::SystemTime {
        let mut latest = std::time::SystemTime::UNIX_EPOCH;
        for p in paths {
            if let Ok(meta) = fs::metadata(p) {
                if let Ok(m) = meta.modified() {
                    if m > latest {
                        latest = m;
                    }
                }
            }
        }
        latest
    }

    // Collect Python sources to consider for rebuild: runner/service_runner.py, runner/sentry_config.py, runner/requirements.txt, and all files under runner/services (recursive)
    let mut py_sources: Vec<PathBuf> = vec![py_src.clone()];
    let sentry_config = repo_root.join("runner").join("sentry_config.py");
    if sentry_config.exists() {
        py_sources.push(sentry_config);
    }
    let requirements = repo_root.join("runner").join("requirements.txt");
    if requirements.exists() {
        py_sources.push(requirements);
    }
    let services_dir = repo_root.join("runner").join("services");
    if services_dir.exists() {
        let mut stack = vec![services_dir.clone()];
        while let Some(dir) = stack.pop() {
            if let Ok(read_dir) = fs::read_dir(&dir) {
                for entry in read_dir.flatten() {
                    let path = entry.path();
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_dir() {
                            stack.push(path);
                        } else if ft.is_file() {
                            py_sources.push(path);
                        }
                    }
                }
            }
        }
    }

    // Determine if rebuild is needed by comparing latest source mtime vs exe mtime
    let needs_rebuild = if target_exe.exists() {
        match fs::metadata(&target_exe) {
            Ok(exe_meta) => {
                let exe_modified = exe_meta
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                let src_latest = latest_mtime(&py_sources);
                let needs = src_latest > exe_modified;
                println!(
                    "cargo:warning=Latest Python source mtime: {:?}, Exe mtime: {:?}, Needs rebuild: {}",
                    src_latest, exe_modified, needs
                );
                // In debug builds, also rebuild if an env var forces it
                let force_rebuild = env::var("AUTOSERVICE_FORCE_RUNNER_REBUILD").is_ok();
                if force_rebuild {
                    println!("cargo:warning=AUTOSERVICE_FORCE_RUNNER_REBUILD is set: will rebuild");
                }
                needs || force_rebuild
            }
            Err(_) => {
                println!("cargo:warning=Could not stat target exe, will rebuild");
                true
            }
        }
    } else {
        println!("cargo:warning=Target executable doesn't exist, will build");
        true
    };

    if !needs_rebuild {
        println!("cargo:warning=Executable is up to date, skipping PyInstaller build");
        // Still ensure mirror copy exists / updated
        if target_exe.exists() {
            if mirror_exe != target_exe {
                if let Err(e) = fs::copy(&target_exe, &mirror_exe) {
                    println!("cargo:warning=Failed to refresh mirror exe copy: {}", e);
                } else {
                    println!("cargo:warning=Mirror exe refreshed (skip build path)");
                }
            }
        }
        return;
    }

    // Remove existing executable to ensure clean build
    if target_exe.exists() {
        if let Err(e) = fs::remove_file(&target_exe) {
            println!(
                "cargo:warning=Failed to remove existing {}: {}",
                target_exe.display(),
                e
            );
            // continue and let PyInstaller try to overwrite
        } else {
            println!("cargo:warning=Removed existing executable");
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

    // Check if PyInstaller is available
    let pyinstaller_check = Command::new(PYTHON_COMMAND)
        .arg("-c")
        .arg("import PyInstaller; print('PyInstaller version:', PyInstaller.__version__)")
        .output();

    match pyinstaller_check {
        Ok(output) if output.status.success() => {
            println!(
                "cargo:warning=PyInstaller check successful: {}",
                String::from_utf8_lossy(&output.stdout)
            );
        }
        Ok(output) => {
            println!(
                "cargo:warning=PyInstaller check failed with exit code: {:?}",
                output.status.code()
            );
            println!(
                "cargo:warning=stdout: {}",
                String::from_utf8_lossy(&output.stdout)
            );
            println!(
                "cargo:warning=stderr: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            println!("cargo:warning=PyInstaller not available or not working. Please install with: pip install pyinstaller");
            return;
        }
        Err(e) => {
            println!("cargo:warning=Failed to execute python command: {}", e);
            println!("cargo:warning=This usually means Python is not in PATH during the build");
            println!("cargo:warning=Please install with: pip install pyinstaller");
            return;
        }
    }

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

    println!("cargo:warning=Executing PyInstaller command...");
    println!("cargo:warning=Command: {} -m PyInstaller --onefile --noconfirm --distpath {} --workpath {} --specpath {} --name {} {}",
             PYTHON_COMMAND, bin_dir_str, workpath_str, specpath_str, PYTHON_RUNNER_STEM, py_src.display());

    // Use .output() instead of .status() to capture stdout/stderr and ensure full completion
    let output = Command::new(PYTHON_COMMAND)
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
        .output();

    match output {
        Ok(output) if output.status.success() => {
            // PyInstaller completed successfully, but the file might not be immediately
            // available due to Windows file system delays or antivirus scanning.
            // Retry checking for the file with a brief delay.
            let mut found = false;
            for attempt in 1..=10 {
                if target_exe.exists() {
                    found = true;
                    break;
                }
                if attempt < 10 {
                    println!(
                        "cargo:warning=Waiting for exe to appear (attempt {}/10)...",
                        attempt
                    );
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }

            if found {
                println!(
                    "cargo:warning=PyInstaller finished successfully; created {} (size: {} bytes)",
                    target_exe.display(),
                    target_exe.metadata().map(|m| m.len()).unwrap_or(0)
                );
                if mirror_exe != target_exe {
                    match fs::copy(&target_exe, &mirror_exe) {
                        Ok(_) => println!(
                            "cargo:warning=Copied exe to mirror location: {}",
                            mirror_exe.display()
                        ),
                        Err(e) => println!(
                            "cargo:warning=Failed to copy exe to mirror location {}: {}",
                            mirror_exe.display(),
                            e
                        ),
                    }
                }
            } else {
                println!(
                    "cargo:warning=PyInstaller reported success but {} was not found after 5 seconds",
                    target_exe.display()
                );
                println!(
                    "cargo:warning=This may indicate antivirus interference or file system delays"
                );
                // Show PyInstaller output for debugging
                if !output.stdout.is_empty() {
                    println!(
                        "cargo:warning=PyInstaller stdout: {}",
                        String::from_utf8_lossy(&output.stdout)
                    );
                }
                if !output.stderr.is_empty() {
                    println!(
                        "cargo:warning=PyInstaller stderr: {}",
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
                // List contents of bin directory to see what was created
                if let Ok(entries) = fs::read_dir(&bin_dir) {
                    println!("cargo:warning=Contents of {}:", bin_dir.display());
                    for entry in entries {
                        if let Ok(entry) = entry {
                            println!("cargo:warning=  {}", entry.path().display());
                        }
                    }
                }
            }
        }
        Ok(output) => {
            println!("cargo:warning=PyInstaller exited with status {} - executable may not have been created", output.status);
            // Show PyInstaller output for debugging
            if !output.stdout.is_empty() {
                println!(
                    "cargo:warning=PyInstaller stdout: {}",
                    String::from_utf8_lossy(&output.stdout)
                );
            }
            if !output.stderr.is_empty() {
                println!(
                    "cargo:warning=PyInstaller stderr: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
            // List contents of bin directory to see what was created
            if let Ok(entries) = fs::read_dir(&bin_dir) {
                println!("cargo:warning=Contents of {}:", bin_dir.display());
                for entry in entries {
                    if let Ok(entry) = entry {
                        println!("cargo:warning=  {}", entry.path().display());
                    }
                }
            }
        }
        Err(e) => {
            println!("cargo:warning=Failed to execute PyInstaller (is Python/pyinstaller installed?): {}", e);
        }
    }

    println!("cargo:warning=build.rs FINISHED EXECUTION");

    // No platform-suffixed or sidecar copies needed; we run the EXE directly from data/resources/bin.
}
