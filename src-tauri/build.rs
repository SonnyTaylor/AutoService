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

    // We now build the Python runner directly into the app's data/resources/bin folder
    // so the runtime can spawn it without sidecar registration.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();
    let bin_dir = data_root.join("resources").join("bin");
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

    println!("cargo:warning=Target executable: {}", target_exe.display());
    println!(
        "cargo:warning=Target executable exists: {}",
        target_exe.exists()
    );

    // Check modification times to see if we need to rebuild
    let needs_rebuild = if target_exe.exists() {
        match (fs::metadata(&py_src), fs::metadata(&target_exe)) {
            (Ok(src_meta), Ok(exe_meta)) => {
                let src_modified = src_meta
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                let exe_modified = exe_meta
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                let needs_rebuild = src_modified > exe_modified;
                println!(
                    "cargo:warning=Source modified: {:?}, Exe modified: {:?}, Needs rebuild: {}",
                    src_modified, exe_modified, needs_rebuild
                );
                needs_rebuild
            }
            _ => {
                println!("cargo:warning=Could not check file modification times, will rebuild");
                true
            }
        }
    } else {
        println!("cargo:warning=Target executable doesn't exist, will build");
        true
    };

    if !needs_rebuild {
        println!("cargo:warning=Executable is up to date, skipping PyInstaller build");
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
        _ => {
            println!("cargo:warning=PyInstaller not available or not working. Please install with: pip install pyinstaller");
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
            if target_exe.exists() {
                println!(
                    "cargo:warning=PyInstaller finished successfully; created {} (size: {} bytes)",
                    target_exe.display(),
                    target_exe.metadata().map(|m| m.len()).unwrap_or(0)
                );
            } else {
                println!(
                    "cargo:warning=PyInstaller reported success but {} was not found",
                    target_exe.display()
                );
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
        Ok(s) => {
            println!("cargo:warning=PyInstaller exited with status {} - executable may not have been created", s);
            println!("cargo:warning=Check the PyInstaller output above for error details");
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
