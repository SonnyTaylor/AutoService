use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: Option<String>,
    pub hostname: Option<String>,
    pub kernel_version: Option<String>,
    pub os_version: Option<String>,
    pub system_name: Option<String>,
    pub uptime_seconds: u64,
    pub boot_time_seconds: u64,
    pub users: Vec<String>,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
    pub networks: Vec<NetworkInfo>,
    pub gpus: Vec<GpuInfo>,
    pub sensors: Vec<SensorInfo>,
    pub batteries: Vec<BatteryInfo>,
    pub motherboard: Option<MotherboardInfo>,
    pub product: Option<ProductInfo>,
    pub load_avg: LoadAvgInfo,
    // Optional bucket for platform-specific extra info gathered via shell commands.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ExtraInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    pub brand: String,
    pub vendor_id: Option<String>,
    pub frequency_mhz: u64,
    pub num_physical_cores: Option<usize>,
    pub num_logical_cpus: usize,
    pub cores: Vec<CpuCoreInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuCoreInfo {
    pub name: String,
    pub frequency_mhz: u64,
    pub usage_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total: u64,
    pub available: u64,
    pub used: u64,
    pub free: u64,
    pub swap_total: u64,
    pub swap_used: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub file_system: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
    pub is_read_only: bool,
    pub kind: String,
    pub read_bytes: u64,
    pub written_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub interface: String,
    pub mac: Option<String>,
    pub mtu: u64,
    pub ips: Vec<String>,
    pub received: u64,
    pub transmitted: u64,
    pub total_received: u64,
    pub total_transmitted: u64,
    pub errors_rx: u64,
    pub errors_tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: Option<u32>,
    pub device: Option<u32>,
    pub device_type: Option<String>,
    pub driver: Option<String>,
    pub driver_info: Option<String>,
    pub backend: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorInfo {
    pub label: String,
    pub temperature_c: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub serial: Option<String>,
    pub technology: Option<String>,
    pub state: String,
    pub percentage: f32,
    pub cycle_count: Option<u32>,
    pub state_of_health_pct: Option<f32>,
    pub energy_wh: Option<f32>,
    pub energy_full_wh: Option<f32>,
    pub energy_full_design_wh: Option<f32>,
    pub voltage_v: Option<f32>,
    pub temperature_c: Option<f32>,
    pub time_to_full_sec: Option<u64>,
    pub time_to_empty_sec: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotherboardInfo {
    pub vendor: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInfo {
    pub vendor: Option<String>,
    pub name: Option<String>,
    pub family: Option<String>,
    pub version: Option<String>,
    pub serial_number: Option<String>,
    pub sku: Option<String>,
    pub uuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadAvgInfo {
    pub one: f64,
    pub five: f64,
    pub fifteen: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExtraInfo {
    // Windows-specific extras
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secure_boot: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tpm_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bios_vendor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bios_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bios_release_date: Option<String>,
    #[serde(default)]
    pub hotfixes: Vec<String>,
    #[serde(default)]
    pub video_controllers: Vec<String>,
    #[serde(default)]
    pub physical_disks: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dotnet_version: Option<String>,
    // Extended details (Windows) as JSON objects for flexible rendering
    #[serde(default)]
    pub ram_modules: Vec<serde_json::Value>,
    #[serde(default)]
    pub cpu_wmi: Vec<serde_json::Value>,
    #[serde(default)]
    pub video_ctrl_ex: Vec<serde_json::Value>,
    #[serde(default)]
    pub baseboard: Vec<serde_json::Value>,
    #[serde(default)]
    pub disk_drives: Vec<serde_json::Value>,
    #[serde(default)]
    pub nic_enabled: Vec<serde_json::Value>,
    #[serde(default)]
    pub computer_system: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramEntry {
    pub id: Uuid,
    pub name: String,
    pub version: String,
    pub description: String,
    pub exe_path: String,
    pub logo_data_url: String,
    #[serde(default)]
    pub exe_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramDiskEntry {
    pub id: Uuid,
    pub name: String,
    pub version: String,
    pub description: String,
    pub exe_path: String,
    pub logo_data_url: String,
}
