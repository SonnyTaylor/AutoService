use std::{fs, path::{Path, PathBuf}};
use image::GenericImageView;
use uuid::Uuid;

use crate::paths;

#[tauri::command]
pub fn read_image_as_data_url(path: String) -> Result<String, String> {
    load_image_data_url(std::path::Path::new(&path))
}

#[tauri::command]
pub fn suggest_logo_from_exe(state: tauri::State<crate::state::AppState>, exe_path: String) -> Result<Option<String>, String> {
    get_logo_from_exe(state.data_dir.as_path(), &exe_path)
}

pub fn load_image_data_url(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read image: {}", e))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    let mime = match path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) {
        Some(ext) if ext == "png" => "image/png",
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ext) if ext == "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

pub fn get_logo_from_exe(data_root: &Path, exe_path: &str) -> Result<Option<String>, String> {
    let p0 = PathBuf::from(exe_path);
    let p = if p0.is_absolute() { p0 } else { data_root.join(&p0) };

    #[cfg(windows)]
    {
        if let Some(iconsext) = find_iconsext_exe(data_root) {
            if let Ok(Some(url)) = extract_with_iconsext(&iconsext, &p) {
                return Ok(Some(url));
            }
        }

        if let Ok(bytes) = exeico::get_exe_ico(&p) {
            if let Ok(png_data_url) = ico_bytes_to_png_data_url(&bytes) {
                return Ok(Some(png_data_url));
            }
        }
    }

    if let Some(dir) = p.parent() {
        if let Some(stem) = p.file_stem() {
            let ico = dir.join(format!("{}.ico", stem.to_string_lossy()));
            if ico.exists() {
                if let Ok(bytes) = fs::read(&ico) {
                    if let Ok(png) = ico_bytes_to_png_data_url(&bytes) { return Ok(Some(png)); }
                }
                return Ok(load_image_data_url(&ico).ok());
            }
            let png = dir.join(format!("{}.png", stem.to_string_lossy()));
            if png.exists() { return Ok(load_image_data_url(&png).ok()); }
        }
        if let Ok(read) = fs::read_dir(dir) {
            for entry in read.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_l = ext.to_ascii_lowercase();
                    if ext_l == "ico" {
                        if let Ok(bytes) = fs::read(&path) {
                            if let Ok(png) = ico_bytes_to_png_data_url(&bytes) { return Ok(Some(png)); }
                        }
                        return Ok(load_image_data_url(&path).ok());
                    } else if ext_l == "png" {
                        return Ok(load_image_data_url(&path).ok());
                    }
                }
            }
        }
    }
    Ok(None)
}

#[cfg(windows)]
fn find_iconsext_exe(data_root: &Path) -> Option<PathBuf> {
    let (_reports, _programs, _settings, resources) = paths::subdirs(data_root);
    let exe = resources.join("bin").join("iconsextract").join("iconsext.exe");
    if exe.exists() { Some(exe) } else { None }
}

#[cfg(windows)]
fn extract_with_iconsext(iconsext_path: &Path, target_exe: &Path) -> Result<Option<String>, String> {
    use std::process::Command;

    let tmp_dir = std::env::temp_dir().join(format!(
        "autoservice_iconsextract_{}",
        Uuid::new_v4()
    ));
    if let Err(e) = std::fs::create_dir_all(&tmp_dir) {
        return Err(format!("Failed to create temp dir: {}", e));
    }

    let status = Command::new(iconsext_path)
        .args([
            "/save",
            &target_exe.to_string_lossy(),
            &tmp_dir.to_string_lossy(),
            "-icons",
        ])
        .status()
        .map_err(|e| format!("Failed to run IconsExtract: {}", e))?;

    if !status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Ok(None);
    }

    let mut best_png: Option<(u32, u32, Vec<u8>)> = None;
    let mut best_ico: Option<(u32, u32, Vec<u8>)> = None;
    if let Ok(read_dir) = std::fs::read_dir(&tmp_dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let ext_l = path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase());
            match ext_l.as_deref() {
                Some("png") => {
                    if let Ok(bytes) = fs::read(&path) {
                        if let Ok(img) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png) {
                            let (w, h) = img.dimensions();
                            if best_png.as_ref().map(|(bw, bh, _)| w * h > *bw * *bh).unwrap_or(true) {
                                best_png = Some((w, h, bytes));
                            }
                        }
                    }
                }
                Some("ico") => {
                    if let Ok(bytes) = fs::read(&path) {
                        if let Ok(img) = image::load_from_memory_with_format(&bytes, image::ImageFormat::Ico) {
                            let (w, h) = img.dimensions();
                            if best_ico.as_ref().map(|(bw, bh, _)| w * h > *bw * *bh).unwrap_or(true) {
                                best_ico = Some((w, h, bytes));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let out = if let Some((_w, _h, bytes)) = best_png {
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        Some(format!("data:image/png;base64,{}", b64))
    } else if let Some((_w, _h, ico_bytes)) = best_ico {
        Some(ico_bytes_to_png_data_url(&ico_bytes)?)
    } else {
        None
    };

    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(out)
}

fn ico_bytes_to_png_data_url(ico_bytes: &[u8]) -> Result<String, String> {
    let img = image::load_from_memory_with_format(ico_bytes, image::ImageFormat::Ico)
        .map_err(|e| format!("ICO decode failed: {}", e))?;
    let mut buf = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {}", e))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf);
    Ok(format!("data:image/png;base64,{}", b64))
}
