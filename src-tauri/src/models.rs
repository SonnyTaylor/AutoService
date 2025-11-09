//! # Models Module
//!
//! This module defines the data structures used throughout AutoService.
//! It provides comprehensive models for system information, hardware details, installed
//! programs, tools, and scripts. All structures are designed to be serializable and
//! deserializable using Serde, enabling seamless data exchange between the Rust backend
//! and the frontend.
//!
//! ## Key Features
//!
//! - **System Information**: Detailed hardware and software system data
//! - **Hardware Monitoring**: CPU, memory, disk, network, GPU, and sensor information
//! - **Program Management**: Structures for tracking installed programs and their metadata
//! - **Tool Integration**: Models for external tools and their status
//! - **Script Management**: Support for various script types and execution tracking
//!
//! ## Usage
//!
//! These models are primarily used for:
//! - Collecting and displaying system information
//! - Managing program installations and launches
//! - Tracking tool availability and status
//! - Executing and monitoring scripts
//!
//! All structures implement `Debug`, `Clone`, `Serialize`, and `Deserialize` traits
//! for maximum flexibility in data handling.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Comprehensive system information collected from the host machine.
/// This structure aggregates all major system components and their current state,
/// providing a complete snapshot of the system's hardware and software configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    /// Operating system name (e.g., "Windows", "Linux", "macOS")
    pub os: Option<String>,
    /// Network hostname of the system
    pub hostname: Option<String>,
    /// Kernel version string
    pub kernel_version: Option<String>,
    /// Full operating system version string
    pub os_version: Option<String>,
    /// System product name or model
    pub system_name: Option<String>,
    /// System uptime in seconds since boot
    pub uptime_seconds: u64,
    /// Boot time as Unix timestamp in seconds
    pub boot_time_seconds: u64,
    /// List of currently logged-in users
    pub users: Vec<String>,
    /// Detailed CPU information
    pub cpu: CpuInfo,
    /// Memory and swap usage statistics
    pub memory: MemoryInfo,
    /// List of all disk drives and their information
    pub disks: Vec<DiskInfo>,
    /// List of network interfaces and their statistics
    pub networks: Vec<NetworkInfo>,
    /// List of graphics processing units
    pub gpus: Vec<GpuInfo>,
    /// List of hardware sensors (temperatures, fans, etc.)
    pub sensors: Vec<SensorInfo>,
    /// List of battery information (for laptops/desktops with batteries)
    pub batteries: Vec<BatteryInfo>,
    /// Motherboard hardware information
    pub motherboard: Option<MotherboardInfo>,
    /// System product information
    pub product: Option<ProductInfo>,
    /// System load averages (1, 5, and 15 minute averages)
    pub load_avg: LoadAvgInfo,
    /// Optional bucket for platform-specific extra information gathered via shell commands.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ExtraInfo>,
}

/// Detailed information about the system's central processing unit(s).
/// Contains both aggregate CPU information and per-core details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    /// CPU brand/model name (e.g., "Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz")
    pub brand: String,
    /// CPU vendor identifier (e.g., "GenuineIntel", "AuthenticAMD")
    pub vendor_id: Option<String>,
    /// Current CPU frequency in MHz
    pub frequency_mhz: u64,
    /// Number of physical CPU cores (not including hyper-threading)
    pub num_physical_cores: Option<usize>,
    /// Total number of logical CPU cores (including hyper-threading)
    pub num_logical_cpus: usize,
    /// Detailed information for each CPU core
    pub cores: Vec<CpuCoreInfo>,
}

/// Information about an individual CPU core.
/// Provides per-core frequency and usage statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuCoreInfo {
    /// Core identifier/name (e.g., "cpu0", "cpu1")
    pub name: String,
    /// Current frequency of this core in MHz
    pub frequency_mhz: u64,
    /// Current CPU usage percentage for this core (0.0 to 100.0)
    pub usage_percent: f32,
}

/// Memory usage statistics for the system.
/// Includes both physical RAM and swap/virtual memory information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    /// Total physical memory in bytes
    pub total: u64,
    /// Available memory in bytes (free + cached)
    pub available: u64,
    /// Currently used memory in bytes
    pub used: u64,
    /// Completely free memory in bytes (not including cached)
    pub free: u64,
    /// Total swap/virtual memory in bytes
    pub swap_total: u64,
    /// Currently used swap/virtual memory in bytes
    pub swap_used: u64,
}

/// Information about a disk drive or storage device.
/// Contains both static information (name, filesystem) and dynamic usage statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    /// Device name (e.g., "/dev/sda", "C:")
    pub name: String,
    /// Filesystem type (e.g., "NTFS", "ext4", "APFS")
    pub file_system: String,
    /// Mount point or drive letter (e.g., "/mnt/data", "C:\")
    pub mount_point: String,
    /// Total storage capacity in bytes
    pub total_space: u64,
    /// Available free space in bytes
    pub available_space: u64,
    /// Whether this is a removable drive (USB, SD card, etc.)
    pub is_removable: bool,
    /// Whether the filesystem is read-only
    pub is_read_only: bool,
    /// Type of disk (e.g., "SSD", "HDD", "NVMe")
    pub kind: String,
    /// Total bytes read since boot
    pub read_bytes: u64,
    /// Total bytes written since boot
    pub written_bytes: u64,
}

/// Network interface information and statistics.
/// Contains both configuration details and real-time traffic statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    /// Network interface name (e.g., "eth0", "Wi-Fi", "en0")
    pub interface: String,
    /// MAC address of the interface
    pub mac: Option<String>,
    /// Maximum transmission unit (MTU) in bytes
    pub mtu: u64,
    /// List of IP addresses assigned to this interface
    pub ips: Vec<String>,
    /// Bytes received in the current session
    pub received: u64,
    /// Bytes transmitted in the current session
    pub transmitted: u64,
    /// Total bytes received since boot
    pub total_received: u64,
    /// Total bytes transmitted since boot
    pub total_transmitted: u64,
    /// Number of receive errors
    pub errors_rx: u64,
    /// Number of transmit errors
    pub errors_tx: u64,
}

/// Graphics processing unit information.
/// Contains details about GPU hardware and driver information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    /// GPU model name (e.g., "NVIDIA GeForce RTX 3080")
    pub name: String,
    /// PCI vendor ID
    pub vendor: Option<u32>,
    /// PCI device ID
    pub device: Option<u32>,
    /// Type of GPU device (e.g., "Discrete", "Integrated")
    pub device_type: Option<String>,
    /// Driver name/version
    pub driver: Option<String>,
    /// Additional driver information
    pub driver_info: Option<String>,
    /// Graphics backend (e.g., "Vulkan", "OpenGL", "DirectX")
    pub backend: Option<String>,
}

/// Hardware sensor information, typically temperature readings.
/// Used for monitoring system temperatures from various components.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorInfo {
    /// Sensor label/description (e.g., "CPU Package", "GPU Core")
    pub label: String,
    /// Temperature reading in Celsius
    pub temperature_c: f32,
}

/// Battery information for systems with battery power.
/// Contains detailed battery status and health information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    /// Battery manufacturer/vendor
    pub vendor: Option<String>,
    /// Battery model name
    pub model: Option<String>,
    /// Battery serial number
    pub serial: Option<String>,
    /// Battery technology (e.g., "Li-ion", "LiPo")
    pub technology: Option<String>,
    /// Current battery state (e.g., "Charging", "Discharging", "Full")
    pub state: String,
    /// Battery charge percentage (0.0 to 100.0)
    pub percentage: f32,
    /// Number of charge/discharge cycles
    pub cycle_count: Option<u32>,
    /// Battery health as percentage of design capacity
    pub state_of_health_pct: Option<f32>,
    /// Current energy stored in watt-hours
    pub energy_wh: Option<f32>,
    /// Full charge capacity in watt-hours
    pub energy_full_wh: Option<f32>,
    /// Design capacity in watt-hours
    pub energy_full_design_wh: Option<f32>,
    /// Current voltage in volts
    pub voltage_v: Option<f32>,
    /// Battery temperature in Celsius
    pub temperature_c: Option<f32>,
    /// Estimated time to full charge in seconds
    pub time_to_full_sec: Option<u64>,
    /// Estimated time to empty in seconds
    pub time_to_empty_sec: Option<u64>,
}

/// Motherboard hardware information.
/// Contains details about the system's main circuit board.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotherboardInfo {
    /// Motherboard manufacturer
    pub vendor: Option<String>,
    /// Motherboard model name
    pub name: Option<String>,
    /// Motherboard version/revision
    pub version: Option<String>,
    /// Motherboard serial number
    pub serial_number: Option<String>,
    /// Motherboard asset tag
    pub asset_tag: Option<String>,
}

/// System product information.
/// Contains details about the overall system product/chassis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInfo {
    /// System manufacturer/vendor
    pub vendor: Option<String>,
    /// System product name/model
    pub name: Option<String>,
    /// Product family
    pub family: Option<String>,
    /// Product version
    pub version: Option<String>,
    /// Product serial number
    pub serial_number: Option<String>,
    /// Stock keeping unit (SKU)
    pub sku: Option<String>,
    /// System UUID
    pub uuid: Option<String>,
}

/// System load averages.
/// Provides 1, 5, and 15-minute load averages indicating system utilization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadAvgInfo {
    /// 1-minute load average
    pub one: f64,
    /// 5-minute load average
    pub five: f64,
    /// 15-minute load average
    pub fifteen: f64,
}

/// Extended platform-specific system information.
/// Contains additional details gathered via shell commands, primarily Windows-specific
/// but extensible for other platforms. Fields are optional and may not be present
/// on all systems.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExtraInfo {
    /// Secure Boot status (Windows-specific)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secure_boot: Option<String>,
    /// TPM (Trusted Platform Module) summary information
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tpm_summary: Option<String>,
    /// BIOS vendor information
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bios_vendor: Option<String>,
    /// BIOS version string
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bios_version: Option<String>,
    /// BIOS release date
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bios_release_date: Option<String>,
    /// List of installed Windows hotfixes/updates
    #[serde(default)]
    pub hotfixes: Vec<String>,
    /// List of video controller descriptions
    #[serde(default)]
    pub video_controllers: Vec<String>,
    /// List of physical disk descriptions
    #[serde(default)]
    pub physical_disks: Vec<String>,
    /// .NET Framework version information
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dotnet_version: Option<String>,
    /// Extended RAM module details as JSON objects
    #[serde(default)]
    pub ram_modules: Vec<serde_json::Value>,
    /// Extended CPU information from WMI as JSON objects
    #[serde(default)]
    pub cpu_wmi: Vec<serde_json::Value>,
    /// Extended video controller information as JSON objects
    #[serde(default)]
    pub video_ctrl_ex: Vec<serde_json::Value>,
    /// Baseboard/motherboard information as JSON objects
    #[serde(default)]
    pub baseboard: Vec<serde_json::Value>,
    /// Disk drive information as JSON objects
    #[serde(default)]
    pub disk_drives: Vec<serde_json::Value>,
    /// Enabled network interface information as JSON objects
    #[serde(default)]
    pub nic_enabled: Vec<serde_json::Value>,
    /// Computer system information as JSON objects
    #[serde(default)]
    pub computer_system: Vec<serde_json::Value>,
}

/// Information about an installed program or application.
/// Used for tracking programs that can be launched from the AutoService interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramEntry {
    /// Unique identifier for the program
    pub id: Uuid,
    /// Display name of the program
    pub name: String,
    /// Version string of the program
    pub version: String,
    /// Description of the program's functionality
    pub description: String,
    /// Path to the executable file
    pub exe_path: String,
    /// Base64-encoded logo/icon data URL for display
    pub logo_data_url: String,
    /// Whether the executable file exists on disk (computed at runtime)
    #[serde(default)]
    pub exe_exists: bool,
    /// Number of times the program has been launched from the app
    #[serde(default)]
    pub launch_count: u32,
}

/// Disk-persisted version of program information.
/// Similar to ProgramEntry but optimized for storage and persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramDiskEntry {
    /// Unique identifier for the program
    pub id: Uuid,
    /// Display name of the program
    pub name: String,
    /// Version string of the program
    pub version: String,
    /// Description of the program's functionality
    pub description: String,
    /// Path to the executable file
    pub exe_path: String,
    /// Base64-encoded logo/icon data URL for display
    pub logo_data_url: String,
    /// Persisted launch counter (default to 0 when missing in older files)
    #[serde(default)]
    pub launch_count: u32,
}

/// Status information for external tools used by the application.
/// Tracks whether tools are available and provides hints for missing tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStatus {
    /// Unique key/identifier for the tool
    pub key: String,
    /// Display name of the tool
    pub name: String,
    /// Whether the tool is available/installed on the system
    pub exists: bool,
    /// Path to the tool executable (if found)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// Hint or instruction for installing the tool if missing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

/// Information about a script that can be executed by the application.
/// Supports various script types and execution methods.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptEntry {
    /// Unique identifier for the script
    pub id: Uuid,
    /// Display name of the script
    pub name: String,
    /// Version string of the script
    #[serde(default)]
    pub version: String,
    /// Description of the script's functionality
    pub description: String,
    /// Execution runner type ("powershell", "cmd", etc.)
    pub runner: String,
    /// Source type ("file", "link", "inline")
    pub source: String,
    /// File path (when source is "file")
    #[serde(default)]
    pub path: String,
    /// URL for downloading (when source is "link")
    #[serde(default)]
    pub url: String,
    /// Inline script content (when source is "inline")
    #[serde(default)]
    pub inline: String,
    /// Number of times the script has been executed
    #[serde(default)]
    pub run_count: u32,
    /// Whether the script file exists on disk (computed at runtime, not persisted)
    #[serde(default, skip_serializing)]
    pub path_exists: bool,
}

/// Information about a program stack (group of programs).
/// Used for categorizing and quickly accessing multiple programs together.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramStack {
    /// Unique identifier for the stack
    pub id: Uuid,
    /// Display name of the stack
    pub name: String,
    /// Optional description of the stack's purpose
    pub description: String,
    /// List of program IDs that belong to this stack
    pub program_ids: Vec<Uuid>,
    /// Optional creation timestamp for sorting
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

/// Disk-persisted version of program stack information.
/// Similar to ProgramStack but optimized for storage and persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramStackDiskEntry {
    /// Unique identifier for the stack
    pub id: Uuid,
    /// Display name of the stack
    pub name: String,
    /// Optional description of the stack's purpose
    pub description: String,
    /// List of program IDs that belong to this stack
    pub program_ids: Vec<Uuid>,
    /// Optional creation timestamp for sorting
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}