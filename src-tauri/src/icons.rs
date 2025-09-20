//! # Icons Module
//!
//! This module handles icon and image processing for AutoService.
//! It provides functionality to:
//! - Load images as data URLs for web display
//! - Extract icons from executable files
//! - Convert between different image formats
//!
//! The module uses external tools like IconsExtract on Windows for better icon extraction.
//! I should really try not rely on external tools but this is the best i could do 乁( ͡° ͜ʖ ͡°)ㄏ

use image::GenericImageView;
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

use crate::paths;

/// Reads an image file and returns it as a base64-encoded data URL.
///
/// This function is exposed to the frontend via Tauri commands.
/// It supports PNG, JPEG, and ICO formats.
///
/// # Arguments
/// * `path` - The file path to the image
///
/// # Returns
/// A data URL string on success, or an error message on failure
#[tauri::command]
pub fn read_image_as_data_url(path: String) -> Result<String, String> {
    load_image_data_url(std::path::Path::new(&path))
}

/// Attempts to find and extract a logo/icon from an executable file.
///
/// This function tries multiple approaches:
/// 1. Use IconsExtract tool (Windows only)
/// 2. Extract icon directly from EXE
/// 3. Look for .ico or .png files with the same name in the same directory
/// 4. Search for any .ico or .png files in the directory
///
/// # Arguments
/// * `state` - The application state containing data directory path
/// * `exe_path` - Path to the executable file
///
/// # Returns
/// A data URL string of the found icon, or None if no icon is found
#[tauri::command]
pub fn suggest_logo_from_exe(
    state: tauri::State<crate::state::AppState>,
    exe_path: String,
) -> Result<Option<String>, String> {
    get_logo_from_exe(state.data_dir.as_path(), &exe_path)
}

/// Internal function to load an image file as a data URL.
///
/// This handles the actual file reading and encoding process.
/// It determines the MIME type based on file extension.
///
/// # Arguments
/// * `path` - Path to the image file
///
/// # Returns
/// A data URL string on success, or an error message on failure
pub fn load_image_data_url(path: &Path) -> Result<String, String> {
    // Read the file contents into bytes
    let bytes = fs::read(path).map_err(|e| format!("Failed to read image: {}", e))?;

    // Encode bytes to base64
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

    // Determine MIME type based on file extension
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
    {
        Some(ext) if ext == "png" => "image/png",
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ext) if ext == "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };

    Ok(format!("data:{};base64,{}", mime, b64))
}

/// Main function to find a logo/icon for an executable file.
///
/// This function implements a fallback strategy to find the best available icon.
///
/// # Arguments
/// * `data_root` - Root directory for data files
/// * `exe_path` - Path to the executable file
///
/// # Returns
/// A data URL string of the found icon, or None if no suitable icon is found
pub fn get_logo_from_exe(data_root: &Path, exe_path: &str) -> Result<Option<String>, String> {
    // Convert to absolute path if relative
    let exe_full_path = PathBuf::from(exe_path);
    let exe_path_absolute = if exe_full_path.is_absolute() {
        exe_full_path
    } else {
        data_root.join(&exe_full_path)
    };

    // Try IconsExtract tool first (Windows only)
    #[cfg(windows)]
    {
        if let Some(iconsext_exe_path) = find_iconsext_exe(data_root) {
            if let Ok(Some(data_url)) =
                extract_with_iconsext(&iconsext_exe_path, &exe_path_absolute)
            {
                return Ok(Some(data_url));
            }
        }

        // Try direct extraction from EXE
        if let Ok(icon_bytes) = exeico::get_exe_ico(&exe_path_absolute) {
            if let Ok(png_data_url) = ico_bytes_to_png_data_url(&icon_bytes) {
                return Ok(Some(png_data_url));
            }
        }
    }

    // Look for icon files in the same directory
    if let Some(parent_directory) = exe_path_absolute.parent() {
        if let Some(file_stem) = exe_path_absolute.file_stem() {
            // Check for .ico file with same name
            let ico_path = parent_directory.join(format!("{}.ico", file_stem.to_string_lossy()));
            if ico_path.exists() {
                if let Ok(icon_bytes) = fs::read(&ico_path) {
                    if let Ok(png_data_url) = ico_bytes_to_png_data_url(&icon_bytes) {
                        return Ok(Some(png_data_url));
                    }
                }
                // Fallback to direct loading if conversion fails
                return Ok(load_image_data_url(&ico_path).ok());
            }

            // Check for .png file with same name
            let png_path = parent_directory.join(format!("{}.png", file_stem.to_string_lossy()));
            if png_path.exists() {
                return Ok(load_image_data_url(&png_path).ok());
            }
        }

        // Search directory for any .ico or .png files
        if let Ok(directory_entries) = fs::read_dir(parent_directory) {
            for entry in directory_entries.flatten() {
                let file_path = entry.path();
                if let Some(extension) = file_path.extension().and_then(|e| e.to_str()) {
                    let extension_lower = extension.to_ascii_lowercase();
                    if extension_lower == "ico" {
                        if let Ok(icon_bytes) = fs::read(&file_path) {
                            if let Ok(png_data_url) = ico_bytes_to_png_data_url(&icon_bytes) {
                                return Ok(Some(png_data_url));
                            }
                        }
                        // Fallback to direct loading
                        return Ok(load_image_data_url(&file_path).ok());
                    } else if extension_lower == "png" {
                        return Ok(load_image_data_url(&file_path).ok());
                    }
                }
            }
        }
    }

    // No icon found
    Ok(None)
}

/// Finds the IconsExtract executable in the resources directory.
///
/// This tool is used for better icon extraction on Windows.
///
/// # Arguments
/// * `data_root` - Root directory for data files
///
/// # Returns
/// Path to the IconsExtract executable if found, None otherwise
#[cfg(windows)]
fn find_iconsext_exe(data_root: &Path) -> Option<PathBuf> {
    let (_reports, _programs, _settings, resources) = paths::subdirs(data_root);
    let exe_path = resources
        .join("bin")
        .join("iconsextract")
        .join("iconsext.exe");

    if exe_path.exists() {
        Some(exe_path)
    } else {
        None
    }
}

/// Extracts icons from an executable using the IconsExtract tool.
///
/// This function creates a temporary directory, runs IconsExtract,
/// and processes the extracted icons to find the best one.
///
/// # Arguments
/// * `iconsext_path` - Path to the IconsExtract executable
/// * `target_exe` - Path to the executable to extract icons from
///
/// # Returns
/// A data URL of the best extracted icon, or None if extraction fails
#[cfg(windows)]
fn extract_with_iconsext(
    iconsext_path: &Path,
    target_exe: &Path,
) -> Result<Option<String>, String> {
    use std::process::Command;

    // Create a unique temporary directory for extraction
    let temp_dir =
        std::env::temp_dir().join(format!("autoservice_iconsextract_{}", Uuid::new_v4()));
    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        return Err(format!("Failed to create temp dir: {}", e));
    }

    // Run IconsExtract to extract icons
    let command_result = Command::new(iconsext_path)
        .args([
            "/save",
            &target_exe.to_string_lossy(),
            &temp_dir.to_string_lossy(),
            "-icons",
        ])
        .status()
        .map_err(|e| format!("Failed to run IconsExtract: {}", e))?;

    if !command_result.success() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Ok(None);
    }

    // Find the best icon from extracted files
    let mut best_png: Option<(u32, u32, Vec<u8>)> = None;
    let mut best_ico: Option<(u32, u32, Vec<u8>)> = None;

    if let Ok(directory_entries) = std::fs::read_dir(&temp_dir) {
        for entry in directory_entries.flatten() {
            let file_path = entry.path();
            if !file_path.is_file() {
                continue;
            }

            let extension_lower = file_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_ascii_lowercase());

            match extension_lower.as_deref() {
                Some("png") => {
                    if let Ok(file_bytes) = fs::read(&file_path) {
                        if let Ok(image) = image::load_from_memory_with_format(
                            &file_bytes,
                            image::ImageFormat::Png,
                        ) {
                            let (width, height) = image.dimensions();
                            // Keep the largest PNG
                            if best_png
                                .as_ref()
                                .map(|(best_width, best_height, _)| {
                                    width * height > *best_width * *best_height
                                })
                                .unwrap_or(true)
                            {
                                best_png = Some((width, height, file_bytes));
                            }
                        }
                    }
                }
                Some("ico") => {
                    if let Ok(file_bytes) = fs::read(&file_path) {
                        if let Ok(image) = image::load_from_memory_with_format(
                            &file_bytes,
                            image::ImageFormat::Ico,
                        ) {
                            let (width, height) = image.dimensions();
                            // Keep the largest ICO
                            if best_ico
                                .as_ref()
                                .map(|(best_width, best_height, _)| {
                                    width * height > *best_width * *best_height
                                })
                                .unwrap_or(true)
                            {
                                best_ico = Some((width, height, file_bytes));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Convert the best found icon to data URL
    let result = if let Some((_width, _height, png_bytes)) = best_png {
        let base64_encoded =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_bytes);
        Some(format!("data:image/png;base64,{}", base64_encoded))
    } else if let Some((_width, _height, ico_bytes)) = best_ico {
        Some(ico_bytes_to_png_data_url(&ico_bytes)?)
    } else {
        None
    };

    // Clean up temporary directory
    let _ = std::fs::remove_dir_all(&temp_dir);
    Ok(result)
}

/// Converts ICO format bytes to a PNG data URL.
///
/// This function loads the ICO image and re-encodes it as PNG,
/// then returns it as a base64 data URL.
///
/// # Arguments
/// * `ico_bytes` - Raw bytes of the ICO image
///
/// # Returns
/// A PNG data URL string on success, or an error message on failure
fn ico_bytes_to_png_data_url(ico_bytes: &[u8]) -> Result<String, String> {
    // Load the ICO image
    let image = image::load_from_memory_with_format(ico_bytes, image::ImageFormat::Ico)
        .map_err(|e| format!("ICO decode failed: {}", e))?;

    // Encode as PNG
    let mut png_buffer = Vec::new();
    image
        .write_to(
            &mut std::io::Cursor::new(&mut png_buffer),
            image::ImageFormat::Png,
        )
        .map_err(|e| format!("PNG encode failed: {}", e))?;

    // Convert to base64 data URL
    let base64_encoded =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_buffer);
    Ok(format!("data:image/png;base64,{}", base64_encoded))
}
