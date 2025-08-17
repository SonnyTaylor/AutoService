use sysinfo::{System, Components, Disks, Networks, Users, Cpu};

use crate::models::{
    BatteryInfo, CpuCoreInfo, CpuInfo, DiskInfo, GpuInfo, LoadAvgInfo, MemoryInfo, MotherboardInfo,
    NetworkInfo, ProductInfo, SensorInfo, SystemInfo,
};

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    sys.refresh_cpu_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    let cpus: &[Cpu] = sys.cpus();
    let brand = cpus.first().map(|c| c.brand().to_string()).unwrap_or_default();
    let vendor_id = cpus.first().map(|c| c.vendor_id().to_string());
    let frequency_mhz = cpus.first().map(|c| c.frequency() as u64).unwrap_or(0);
    let num_logical = cpus.len();
    let num_physical = System::physical_core_count();
    let cores: Vec<CpuCoreInfo> = cpus
        .iter()
        .map(|c| CpuCoreInfo { name: c.name().to_string(), frequency_mhz: c.frequency() as u64, usage_percent: c.cpu_usage() })
        .collect();
    let cpu = CpuInfo { brand, vendor_id, frequency_mhz, num_physical_cores: num_physical, num_logical_cpus: num_logical, cores };

    let total = sys.total_memory();
    let available = sys.available_memory();
    let used = sys.used_memory();
    let free = sys.free_memory();
    let swap_total = sys.total_swap();
    let swap_used = sys.used_swap();
    let memory = MemoryInfo { total, available, used, free, swap_total, swap_used };

    let disks_list = Disks::new_with_refreshed_list();
    let disks: Vec<DiskInfo> = disks_list
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().to_string(),
            file_system: d.file_system().to_string_lossy().to_string(),
            mount_point: d.mount_point().to_string_lossy().to_string(),
            total_space: d.total_space(),
            available_space: d.available_space(),
            is_removable: d.is_removable(),
            is_read_only: d.is_read_only(),
            kind: format!("{:?}", d.kind()),
            read_bytes: d.usage().read_bytes,
            written_bytes: d.usage().written_bytes,
        })
        .collect();

    let networks_list = Networks::new_with_refreshed_list();
    let networks: Vec<NetworkInfo> = networks_list
        .iter()
        .map(|(name, data)| NetworkInfo {
            interface: name.clone(),
            mac: Some(data.mac_address().to_string()),
            mtu: data.mtu(),
            ips: data.ip_networks().iter().map(|ip| ip.to_string()).collect(),
            received: data.received(),
            transmitted: data.transmitted(),
            total_received: data.total_received(),
            total_transmitted: data.total_transmitted(),
            errors_rx: data.errors_on_received(),
            errors_tx: data.errors_on_transmitted(),
        })
        .collect();

    let components = Components::new_with_refreshed_list();
    let sensors: Vec<SensorInfo> = components
        .iter()
        .map(|c| SensorInfo { label: c.label().to_string(), temperature_c: c.temperature().unwrap_or(0.0) })
        .collect();

    let gpus: Vec<GpuInfo> = {
        #[allow(unused_mut)]
        let mut all: Vec<GpuInfo> = Vec::new();
        #[cfg(not(target_arch = "wasm32"))]
        {
            use wgpu::{Backends, Instance};
            let instance = Instance::default();
            for adapter in instance.enumerate_adapters(Backends::all()) {
                let info = adapter.get_info();
                all.push(GpuInfo {
                    name: info.name,
                    vendor: Some(info.vendor),
                    device: Some(info.device),
                    device_type: Some(format!("{:?}", info.device_type)),
                    driver: Some(info.driver),
                    driver_info: Some(info.driver_info),
                    backend: Some(format!("{:?}", info.backend)),
                });
            }
        }

        let has_hw = all.iter().any(|g| g.device_type.as_deref() != Some("Cpu"));
        let filtered: Vec<GpuInfo> = if has_hw {
            all.into_iter().filter(|g| g.device_type.as_deref() != Some("Cpu")).collect()
        } else {
            all
        };

        use std::collections::HashMap;

        fn backend_rank(s: Option<&str>) -> u8 {
            match s.unwrap_or("") {
                "Dx12" => 5,
                "Vulkan" => 4,
                "Metal" => 4,
                "Gl" => 2,
                "BrowserWebGpu" => 1,
                _ => 0,
            }
        }

        let mut best: HashMap<String, GpuInfo> = HashMap::new();
        for g in filtered.into_iter() {
            let vendor = g.vendor.unwrap_or(0);
            let device = g.device.unwrap_or(0);
            let key = if device != 0 {
                format!("{}:{}", vendor, device)
            } else {
                format!("{}:{}", vendor, g.name.to_lowercase())
            };

            let cand_score = (
                backend_rank(g.backend.as_deref()),
                (g.device.unwrap_or(0) != 0) as u8,
                g.driver.as_deref().unwrap_or("").len() as u16,
            );

            if let Some(existing) = best.get(&key) {
                let ex_score = (
                    backend_rank(existing.backend.as_deref()),
                    (existing.device.unwrap_or(0) != 0) as u8,
                    existing.driver.as_deref().unwrap_or("").len() as u16,
                );
                if cand_score > ex_score {
                    best.insert(key, g);
                }
            } else {
                best.insert(key, g);
            }
        }

        let vendor_with_real: std::collections::HashSet<u32> = best
            .values()
            .filter_map(|g| {
                let v = g.vendor.unwrap_or(0);
                let d = g.device.unwrap_or(0);
                if v != 0 && d != 0 { Some(v) } else { None }
            })
            .collect();

        let mut out: Vec<GpuInfo> = best
            .into_values()
            .filter(|g| {
                let v = g.vendor.unwrap_or(0);
                let d = g.device.unwrap_or(0);
                if d == 0 && vendor_with_real.contains(&v) { return false; }
                true
            })
            .collect();

        out.sort_by(|a, b| {
            let av = a.vendor.unwrap_or(0).cmp(&b.vendor.unwrap_or(0));
            if av != std::cmp::Ordering::Equal { return av; }
            let ad = a.device.unwrap_or(0).cmp(&b.device.unwrap_or(0));
            if ad != std::cmp::Ordering::Equal { return ad; }
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        });
        out
    };

    let users_list = Users::new_with_refreshed_list();
    let users: Vec<String> = users_list.iter().map(|u| u.name().to_string()).collect();

    let batteries = match get_batteries_info() {
        Ok(list) => list,
        Err(_) => Vec::new(),
    };

    let motherboard = sysinfo::Motherboard::new().map(|m| MotherboardInfo {
        vendor: m.vendor_name(),
        name: m.name(),
        version: m.version(),
        serial_number: m.serial_number(),
        asset_tag: m.asset_tag(),
    });
    let product = Some(ProductInfo {
        vendor: sysinfo::Product::vendor_name(),
        name: sysinfo::Product::name(),
        family: sysinfo::Product::family(),
        version: sysinfo::Product::version(),
        serial_number: sysinfo::Product::serial_number(),
        sku: sysinfo::Product::stock_keeping_unit(),
        uuid: sysinfo::Product::uuid(),
    });

    let la = System::load_average();
    let info = SystemInfo {
        os: sysinfo::System::long_os_version(),
        hostname: System::host_name(),
        kernel_version: System::kernel_version(),
        os_version: System::os_version(),
        system_name: System::name(),
        uptime_seconds: System::uptime(),
        boot_time_seconds: System::boot_time(),
        users,
        cpu,
        memory,
        disks,
        networks,
        gpus,
        sensors,
        batteries,
        motherboard,
        product,
        load_avg: LoadAvgInfo { one: la.one, five: la.five, fifteen: la.fifteen },
    };

    Ok(info)
}

fn get_batteries_info() -> Result<Vec<BatteryInfo>, String> {
    let manager = match battery::Manager::new() { Ok(m) => m, Err(_) => return Ok(Vec::new()) };
    let list = match manager.batteries() { Ok(b) => b, Err(_) => return Ok(Vec::new()) };
    let mut out = Vec::new();
    for item in list {
        if let Ok(batt) = item {
            let percentage = batt.state_of_charge().value as f32 * 100.0;
            let state = format!("{:?}", batt.state());
            let technology = Some(format!("{:?}", batt.technology()));
            let vendor = batt.vendor().map(|s| s.to_string());
            let model = batt.model().map(|s| s.to_string());
            let serial = batt.serial_number().map(|s| s.to_string());
            let cycle_count = batt.cycle_count();
            let soh = Some(batt.state_of_health().value as f32 * 100.0);
            use battery::units::energy::watt_hour;
            let energy_wh = Some(batt.energy().get::<watt_hour>() as f32);
            let energy_full_wh = Some(batt.energy_full().get::<watt_hour>() as f32);
            let energy_full_design_wh = Some(batt.energy_full_design().get::<watt_hour>() as f32);
            let voltage_v = Some(batt.voltage().value as f32);
            let temp_c = batt.temperature().map(|t| t.value as f32);
            let ttf = batt.time_to_full().map(|d| d.value as u64);
            let tte = batt.time_to_empty().map(|d| d.value as u64);
            out.push(BatteryInfo { vendor, model, serial, technology, state, percentage, cycle_count, state_of_health_pct: soh, energy_wh, energy_full_wh, energy_full_design_wh, voltage_v, temperature_c: temp_c, time_to_full_sec: ttf, time_to_empty_sec: tte });
        }
    }
    Ok(out)
}
