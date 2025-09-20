/**
 * Render functions for different system information sections
 *
 * This module contains functions to render HTML for various system information
 * components like OS, CPU, RAM, GPU, storage, network, and battery details.
 * Each function takes system info data and returns formatted HTML strings
 * with tables, progress bars, and badges for a user-friendly display.
 */

import {
  formatBytes,
  formatPct,
  formatDuration,
  escapeHtml,
} from "./formatters.js";
import { makeCollapsible } from "./ui.js";

/**
 * Parses TPM summary JSON and returns formatted status string.
 * @param {string} raw - Raw TPM summary string
 * @returns {string} Formatted TPM status or empty string
 */
function parseTpmSummary(raw) {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return "";

    const parts = [];
    if (v.TpmPresent === true) parts.push("Present");
    else if (v.TpmPresent === false) parts.push("Not Present");

    if (v.TpmReady === true) parts.push("Ready");
    else if (v.TpmReady === false) parts.push("Not Ready");

    if (typeof v.SpecVersion === "string" && v.SpecVersion.trim()) {
      parts.push(`Spec ${v.SpecVersion}`);
    }

    if (typeof v.ManagedAuthLevel === "string" && v.ManagedAuthLevel.trim()) {
      parts.push(v.ManagedAuthLevel);
    }

    return parts.length ? parts.join(" • ") : "";
  } catch (error) {
    console.warn("Failed to parse TPM summary:", error);
    return "";
  }
}

/**
 * Renders the OS information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for OS section
 */
export function renderOS(info, ex) {
  const osExtraRows = [];

  // Add boot time if available
  if (info.boot_time_seconds != null) {
    try {
      const dt = new Date(info.boot_time_seconds * 1000);
      const bootStr = dt.toLocaleString();
      osExtraRows.push(
        `<tr><th>Booted</th><td>${escapeHtml(bootStr)}</td></tr>`
      );
    } catch {}
  }

  // (Moved to dedicated Users section)

  // Add domain information if available
  if (ex && Array.isArray(ex.computer_system) && ex.computer_system.length) {
    const cs = ex.computer_system[0] || {};
    if (cs?.Domain) {
      osExtraRows.push(
        `<tr><th>Domain</th><td>${escapeHtml(cs.Domain)}</td></tr>`
      );
    }
    if (cs?.SystemType) {
      osExtraRows.push(
        `<tr><th>System Type</th><td>${escapeHtml(cs.SystemType)}</td></tr>`
      );
    }
  }

  // Add Secure Boot status
  if (ex?.secure_boot) {
    osExtraRows.push(
      `<tr><th>Secure Boot</th><td>${escapeHtml(ex.secure_boot)}</td></tr>`
    );
  }

  // Add TPM information
  if (ex?.tpm_summary) {
    const tpmStatus = parseTpmSummary(String(ex.tpm_summary || "").trim());
    if (tpmStatus) {
      osExtraRows.push(
        `<tr><th>TPM</th><td>${escapeHtml(tpmStatus)}</td></tr>`
      );
    } else {
      // Fallback for non-JSON or all-null objects
      const compact = String(ex.tpm_summary).replace(/\s+/g, "");
      const allNull =
        compact ===
        '{"TpmPresent":null,"TpmReady":null,"ManagedAuthLevel":null,"OwnerAuth":null,"SpecVersion":null}';
      if (String(ex.tpm_summary) && !allNull) {
        osExtraRows.push(
          `<tr><th>TPM</th><td>${escapeHtml(String(ex.tpm_summary))}</td></tr>`
        );
      }
    }
  }

  // Add .NET version
  if (ex?.dotnet_version) {
    osExtraRows.push(
      `<tr><th>.NET</th><td>${escapeHtml(ex.dotnet_version)}</td></tr>`
    );
  }

  const osHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Operating System</th><td>${escapeHtml(
              info.os || "Unknown"
            )}</td></tr>
            <tr><th>Kernel</th><td>${escapeHtml(
              info.kernel_version || "-"
            )}</td></tr>
            <tr><th>Build</th><td>${escapeHtml(
              info.os_version || "-"
            )}</td></tr>
            <tr><th>Hostname</th><td>${escapeHtml(
              info.hostname || "-"
            )}</td></tr>
            <tr><th>Uptime</th><td>${formatDuration(
              info.uptime_seconds
            )}</td></tr>
            ${osExtraRows.join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return osHtml;
}

/**
 * Renders the system/product information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for system section or empty string if no data
 */
export function renderSystem(info) {
  if (!info.product) return "";

  const product = info.product;
  const rows = [];

  // Add rows for each product property if it exists
  if (product.vendor) {
    rows.push(`<tr><th>Vendor</th><td>${escapeHtml(product.vendor)}</td></tr>`);
  }
  if (product.name) {
    rows.push(`<tr><th>Model</th><td>${escapeHtml(product.name)}</td></tr>`);
  }
  if (product.family) {
    rows.push(`<tr><th>Family</th><td>${escapeHtml(product.family)}</td></tr>`);
  }
  if (product.version) {
    rows.push(
      `<tr><th>Version</th><td>${escapeHtml(product.version)}</td></tr>`
    );
  }
  if (product.serial_number) {
    rows.push(
      `<tr><th>Serial</th><td>${escapeHtml(product.serial_number)}</td></tr>`
    );
  }
  if (product.sku) {
    rows.push(`<tr><th>SKU</th><td>${escapeHtml(product.sku)}</td></tr>`);
  }
  if (product.uuid) {
    rows.push(
      `<tr><th>UUID</th><td><code>${escapeHtml(product.uuid)}</code></td></tr>`
    );
  }

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders the motherboard information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for motherboard section or empty string if no data
 */
export function renderMotherboard(info, ex) {
  if (!info.motherboard) return "";

  const motherboard = info.motherboard;
  const rows = [];

  // Basic motherboard info
  rows.push(
    `<tr><th>Vendor</th><td>${escapeHtml(motherboard.vendor || "-")}</td></tr>`
  );
  if (motherboard.name) {
    rows.push(
      `<tr><th>Model</th><td>${escapeHtml(motherboard.name)}</td></tr>`
    );
  }
  if (motherboard.version) {
    rows.push(
      `<tr><th>Version</th><td>${escapeHtml(motherboard.version)}</td></tr>`
    );
  }
  if (motherboard.serial_number) {
    rows.push(
      `<tr><th>Serial</th><td>${escapeHtml(
        motherboard.serial_number
      )}</td></tr>`
    );
  }
  if (motherboard.asset_tag) {
    rows.push(
      `<tr><th>Asset Tag</th><td>${escapeHtml(motherboard.asset_tag)}</td></tr>`
    );
  }

  // BIOS information
  if (ex?.bios_vendor) {
    rows.push(
      `<tr><th>BIOS Vendor</th><td>${escapeHtml(ex.bios_vendor)}</td></tr>`
    );
  }
  if (ex?.bios_version) {
    rows.push(
      `<tr><th>BIOS Version</th><td>${escapeHtml(ex.bios_version)}</td></tr>`
    );
  }
  if (ex?.bios_release_date) {
    rows.push(
      `<tr><th>BIOS Release</th><td>${escapeHtml(
        ex.bios_release_date
      )}</td></tr>`
    );
  }

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders the CPU information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for CPU section
 */
export function renderCPU(info) {
  const cores = info.cpu.cores || [];
  let avgCpu = null;
  let perCoreGrid = "";
  const loadAvg = info.load_avg || null;

  // Calculate average CPU usage if cores data is available
  if (cores.length > 0) {
    const totalUsage = cores.reduce(
      (sum, core) => sum + (core.usage_percent || 0),
      0
    );
    avgCpu = Math.max(0, Math.min(100, Math.round(totalUsage / cores.length)));

    // Generate per-core usage grid
    perCoreGrid = `
      <div class="per-core-grid">
        ${cores
          .map((core) => {
            const pct = Math.max(
              0,
              Math.min(100, Math.round(core.usage_percent || 0))
            );
            const name = escapeHtml(core.name);
            return `<div class="per-core-item">
            <div class="per-core-name"><span>${name}</span><span class="badge">${pct}%</span></div>
            <div class="progress" aria-label="${name} usage"><div class="bar" style="width:${pct}%;"></div></div>
          </div>`;
          })
          .join("")}
      </div>
    `;
  }

  const rows = [];
  rows.push(`<tr><th>Model</th><td>${escapeHtml(info.cpu.brand)}</td></tr>`);
  rows.push(
    `<tr><th>Vendor</th><td>${escapeHtml(info.cpu.vendor_id || "-")}</td></tr>`
  );
  rows.push(`<tr><th>Cores / Threads</th><td>
    <span class="badge">Physical: ${info.cpu.num_physical_cores ?? "-"}C</span>
    <span class="badge" style="margin-left:6px;">Logical: ${
      info.cpu.num_logical_cpus
    }T</span>
  </td></tr>`);
  rows.push(
    `<tr><th>Frequency</th><td>${
      info.cpu.frequency_mhz
        ? (info.cpu.frequency_mhz / 1000).toFixed(2) + " GHz"
        : "-"
    }</td></tr>`
  );

  if (avgCpu !== null) {
    rows.push(
      `<tr><th>CPU Usage</th><td>${avgCpu}%<div class="progress" aria-label="cpu usage"><div class="bar" style="width:${avgCpu}%;"></div></div></td></tr>`
    );
  }

  // Load averages if available
  if (loadAvg && (loadAvg.one || loadAvg.five || loadAvg.fifteen)) {
    const one = Number(loadAvg.one ?? 0).toFixed(2);
    const five = Number(loadAvg.five ?? 0).toFixed(2);
    const fifteen = Number(loadAvg.fifteen ?? 0).toFixed(2);
    rows.push(
      `<tr><th>Load Average</th><td><span class="badge">${one}</span> <span class="badge">${five}</span> <span class="badge">${fifteen}</span></td></tr>`
    );
  }

  if (perCoreGrid) {
    rows.push(`<tr><th>Per-core usage</th><td>${perCoreGrid}</td></tr>`);
  }

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders a sensors/temperatures section if sensors are present.
 * @param {Object} info - System info object
 * @returns {string} HTML string for sensors section or empty string
 */
export function renderSensors(info) {
  const sensors = Array.isArray(info.sensors) ? info.sensors : [];
  if (!sensors.length) return "";

  const classify = (t) => {
    if (t == null) return "";
    if (t < 50) return "cool";
    if (t < 70) return "warm";
    return "hot";
  };

  const cards = sensors
    .map((s) => {
      const label = escapeHtml(s.label || s.name || "Sensor");
      const temp = Number(s.temperature_c ?? s.temp_c ?? NaN);
      const val = Number.isFinite(temp) ? `${temp.toFixed(1)} °C` : "-";
      const cls = classify(temp);
      return `<div class="sensor">
        <div class="label">${label}</div>
        <div class="temp ${cls}">${val}</div>
      </div>`;
    })
    .join("");

  return `
    <div class="sensor-grid">${cards}</div>
  `;
}

/**
 * Renders Windows Updates/Hotfixes list if available.
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for updates section or empty string
 */
export function renderUpdates(ex) {
  const hotfixes = Array.isArray(ex?.hotfixes) ? ex.hotfixes : [];
  if (!hotfixes.length) return "";

  const rows = hotfixes
    .map((line) => `<tr><td><code>${escapeHtml(String(line))}</code></td></tr>`)
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead><tr><th>Hotfix</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Creates HTML table rows for RAM modules (DIMMs).
 * @param {Array} ramModules - Array of RAM module objects
 * @returns {string} HTML string for DIMM table or empty string
 */
function createDimmTable(ramModules) {
  if (!Array.isArray(ramModules) || !ramModules.length) return "";

  /**
   * Maps form factor numbers to readable strings.
   * @param {number} n - Form factor number
   * @returns {string} Form factor name or original value
   */
  const mapFormFactor = (n) => {
    const formFactors = { 8: "DIMM", 12: "SODIMM" };
    return n in formFactors ? formFactors[n] : n != null ? String(n) : "-";
  };

  const dimmRows = ramModules
    .map((module) => {
      // Extract and format module properties
      const capacity = Number(module?.Capacity || 0);
      const speed = module?.Speed != null ? `${module.Speed} MHz` : "-";
      const voltage =
        module?.ConfiguredVoltage != null
          ? `${(Number(module.ConfiguredVoltage) / 1000).toFixed(2)} V`
          : "-";
      const memoryType =
        module?.MemoryType != null ? String(module.MemoryType) : "-";
      const formFactor = mapFormFactor(Number(module?.FormFactor));
      const width =
        module?.DataWidth != null || module?.TotalWidth != null
          ? `${module?.DataWidth ?? "-"}/${module?.TotalWidth ?? "-"}`
          : "-";

      return `<tr>
      <td>${escapeHtml(module?.BankLabel || "-")}</td>
      <td>${escapeHtml(module?.DeviceLocator || "-")}</td>
      <td>${formatBytes(capacity)}</td>
      <td>${speed}</td>
      <td>${escapeHtml(module?.Manufacturer || "-")}</td>
      <td>${escapeHtml(module?.PartNumber || "-")}</td>
      <td>${escapeHtml(module?.SerialNumber || "-")}</td>
      <td>${memoryType}</td>
      <td>${formFactor}</td>
      <td>${voltage}</td>
      <td>${width}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead><tr>
            <th>Bank</th><th>Locator</th><th>Capacity</th><th>Speed</th><th>Manufacturer</th><th>Part #</th><th>Serial</th><th>Type</th><th>Form</th><th>Voltage</th><th>Width D/T</th>
          </tr></thead>
          <tbody>${dimmRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders the RAM information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for RAM section
 */
export function renderRAM(info, ex) {
  const memory = info.memory;
  const usedMem = memory.used;
  const totalMem = memory.total || 1;
  const memPct = Math.min(100, Math.round((usedMem / totalMem) * 100));

  const dimmHtml = createDimmTable(ex?.ram_modules);

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Usage</th><td>${formatBytes(usedMem)} / ${formatBytes(
    totalMem
  )}
              <span class="badge">${memPct}%</span>
              <div class="progress" aria-label="memory usage"><div class="bar" style="width:${memPct}%;"></div></div></td></tr>
            <tr><th>Free</th><td>${formatBytes(memory.free)}</td></tr>
            <tr><th>Swap</th><td>${formatBytes(
              memory.swap_used
            )} / ${formatBytes(memory.swap_total)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    ${dimmHtml}
  `;
}

/**
 * Creates GPU information table from standard GPU data.
 * @param {Array} gpus - Array of GPU objects
 * @returns {string} HTML table string
 */
function createGpuTable(gpus) {
  if (!gpus || !gpus.length) return "";

  const rows = gpus
    .map((gpu) => {
      // Extract GPU properties with fallbacks
      const vendor = gpu.vendor != null ? String(gpu.vendor) : "-";
      const device = gpu.device != null ? String(gpu.device) : "-";
      const deviceType = gpu.device_type || "-";
      const driver =
        [gpu.driver, gpu.driver_info].filter(Boolean).join(" ") || "-";
      const backend = gpu.backend || "-";

      return `<tr>
      <td>${escapeHtml(gpu.name)}</td>
      <td>${escapeHtml(vendor)}</td>
      <td>${escapeHtml(device)}</td>
      <td>${escapeHtml(deviceType)}</td>
      <td>${escapeHtml(driver)}</td>
      <td>${escapeHtml(backend)}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead><tr><th>Name</th><th>Vendor</th><th>Device</th><th>Type</th><th>Driver</th><th>Backend</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Creates GPU information table from Windows video controller data.
 * @param {Array} videoCtrlEx - Array of video controller objects
 * @returns {string} HTML table string
 */
function createVideoControllerTable(videoCtrlEx) {
  if (!Array.isArray(videoCtrlEx) || !videoCtrlEx.length) return "";

  const rows = videoCtrlEx
    .map((controller) => {
      const name = escapeHtml(controller?.Name || "-");
      const vram = controller?.AdapterRAM
        ? formatBytes(Number(controller.AdapterRAM))
        : "-";
      const driverVersion = escapeHtml(controller?.DriverVersion || "-");
      const videoMode = escapeHtml(controller?.VideoModeDescription || "-");

      return `<tr>
      <td>${name}</td>
      <td>${vram}</td>
      <td>${driverVersion}</td>
      <td>${videoMode}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead><tr><th>Name</th><th>VRAM</th><th>Driver</th><th>Mode</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders the GPU information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for GPU section
 */
export function renderGPU(info, ex) {
  // Try standard GPU info first
  if (info.gpus && info.gpus.length) {
    return createGpuTable(info.gpus);
  }

  // Fallback to Windows video controller data
  if (ex && Array.isArray(ex.video_ctrl_ex) && ex.video_ctrl_ex.length) {
    return createVideoControllerTable(ex.video_ctrl_ex);
  }

  // No GPU info available
  return `
    <div class="table-block">
      <div class="table-wrap">
        <div class="empty-state">No GPU info available</div>
      </div>
    </div>
  `;
}

/**
 * Creates storage disk information table.
 * @param {Array} disks - Array of disk objects
 * @returns {string} HTML table string
 */
function createDiskTable(disks) {
  const rows = disks
    .map((disk) => {
      // Calculate disk usage
      const used = Math.max(0, disk.total_space - disk.available_space);
      const pct = disk.total_space
        ? Math.min(100, Math.round((used / disk.total_space) * 100))
        : 0;

      // Build flags string
      const flags = [
        disk.is_removable ? "Removable" : "",
        disk.is_read_only ? "Read-only" : "",
        disk.kind ? escapeHtml(disk.kind) : "",
      ]
        .filter(Boolean)
        .join(", ");

      return `
      <tr>
        <td>${escapeHtml(disk.name || disk.mount_point)}</td>
        <td>${escapeHtml(disk.mount_point)}</td>
        <td>${escapeHtml(disk.file_system)}</td>
        <td>${flags || "-"}</td>
        <td>
          ${formatBytes(used)} / ${formatBytes(disk.total_space)}
          <span class="badge">${pct}%</span>
          <div class="progress" aria-label="disk usage"><div class="bar" style="width:${pct}%;"></div></div>
        </td>
        <td>R:${formatBytes(disk.read_bytes)} • W:${formatBytes(
        disk.written_bytes
      )}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr>
              <th>Name</th><th>Mount</th><th>FS</th><th>Flags</th><th>Usage</th><th>IO</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Creates disk drive information table from Windows data.
 * @param {Array} diskDrives - Array of disk drive objects
 * @returns {string} HTML table string or empty string
 */
function createDiskDriveTable(diskDrives) {
  if (!Array.isArray(diskDrives) || !diskDrives.length) return "";

  const rows = diskDrives
    .map((drive) => {
      const model = escapeHtml(drive?.Model || "-");
      const interfaceType = escapeHtml(drive?.InterfaceType || "-");
      const mediaType = escapeHtml(drive?.MediaType || "-");
      const size = drive?.Size ? formatBytes(Number(drive.Size)) : "-";

      return `<tr>
      <td>${model}</td>
      <td>${interfaceType}</td>
      <td>${mediaType}</td>
      <td>${size}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr><th>Model</th><th>Interface</th><th>Media Type</th><th>Size</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders the storage information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for storage section
 */
export function renderStorage(info, ex) {
  // Create disk usage table from standard disk info
  const diskTableHtml = createDiskTable(info.disks);

  // Create physical disk drive table from Windows-specific data
  const diskDriveTableHtml = createDiskDriveTable(ex?.disk_drives);

  return diskTableHtml + diskDriveTableHtml;
}

/**
 * Renders the network information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for network section
 */
export function renderNetwork(info) {
  const rows = info.networks
    .map((network) => {
      const interfaceName = escapeHtml(network.interface);
      const mac = network.mac ? escapeHtml(network.mac) : "-";
      const mtu = network.mtu;
      const ips = network.ips.map(escapeHtml).join("<br>");
      const totalRx = formatBytes(network.total_received);
      const totalTx = formatBytes(network.total_transmitted);
      const deltaRx = formatBytes(network.received);
      const deltaTx = formatBytes(network.transmitted);
      const errors =
        network.errors_rx || network.errors_tx
          ? `${network.errors_rx}/${network.errors_tx}`
          : "-";

      return `
      <tr>
        <td>${interfaceName}</td>
        <td>${mac}</td>
        <td>${mtu}</td>
        <td>${ips}</td>
        <td>Rx ${totalRx}<br>Tx ${totalTx}</td>
        <td>Rx ${deltaRx} • Tx ${deltaTx}</td>
        <td>${errors}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr>
              <th>Interface</th><th>MAC</th><th>MTU</th><th>IPs</th><th>Totals</th><th>Δ</th><th>Errors</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Calculates battery health status and label.
 * @param {number|null} healthPct - Battery health percentage
 * @returns {Object} Object with class and label
 */
function getBatteryHealth(healthPct) {
  if (healthPct == null) return { class: "", label: "" };

  if (healthPct >= 80) return { class: "ok", label: "Good" };
  if (healthPct >= 60) return { class: "", label: "Fair" };
  return { class: "warn", label: "Poor" };
}

/**
 * Renders enabled network adapters (Windows WMI) if available.
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for adapters section or empty string
 */
export function renderAdapters(ex) {
  const list = Array.isArray(ex?.nic_enabled) ? ex.nic_enabled : [];
  if (!list.length) return "";

  const rows = list
    .map((nic) => {
      const name = escapeHtml(nic?.Name || nic?.NetConnectionID || "-");
      const mac = escapeHtml(nic?.MACAddress || "-");
      const type = escapeHtml(nic?.AdapterType || "-");
      const speed =
        nic?.Speed != null ? `${Number(nic.Speed) / 1e6} Mbps` : "-";
      const manu = escapeHtml(nic?.Manufacturer || "-");
      return `<tr>
        <td>${name}</td>
        <td>${mac}</td>
        <td>${type}</td>
        <td>${speed}</td>
        <td>${manu}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr><th>Name</th><th>MAC</th><th>Type</th><th>Speed</th><th>Manufacturer</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Renders the battery information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for battery section
 */
export function renderBattery(info) {
  // Handle different battery data formats
  const batteries = Array.isArray(info.batteries)
    ? info.batteries
    : info.battery
    ? [info.battery]
    : [];

  if (!batteries.length) {
    return `
      <div class="table-block">
        <div class="table-wrap">
          <div class="empty-state">No batteries detected</div>
        </div>
      </div>
    `;
  }

  return batteries
    .map((battery, index) => {
      const percentage = battery.percentage ?? 0;
      const stateBadgeClass =
        percentage >= 50 ? "ok" : percentage >= 20 ? "" : "warn";
      const identity = [battery.vendor, battery.model]
        .filter(Boolean)
        .join(" ");

      // Build details string
      const details = [
        battery.cycle_count != null ? `${battery.cycle_count} cycles` : null,
        battery.voltage_v != null ? `${battery.voltage_v.toFixed(2)} V` : null,
        battery.energy_full_wh != null
          ? `Full ${battery.energy_full_wh.toFixed(1)} Wh`
          : null,
        battery.energy_full_design_wh != null
          ? `Design ${battery.energy_full_design_wh.toFixed(1)} Wh`
          : null,
      ]
        .filter(Boolean)
        .join(" • ");

      const health = getBatteryHealth(battery.state_of_health_pct);

      const rows = [];

      // Charge level row
      const batteryLabel = batteries.length > 1 ? `(Battery ${index + 1})` : "";
      rows.push(`<tr><th>Charge ${batteryLabel}</th>
      <td><span class="badge ${stateBadgeClass}">${percentage.toFixed(
        0
      )}%</span>
        <span class="muted" style="margin-left:8px;">${escapeHtml(
          battery.state || "-"
        )}</span></td></tr>`);

      // Identity row
      if (identity) {
        rows.push(`<tr><th>Identity</th><td>${escapeHtml(identity)}</td></tr>`);
      }

      // Serial row
      if (battery.serial) {
        rows.push(
          `<tr><th>Serial</th><td>${escapeHtml(battery.serial)}</td></tr>`
        );
      }

      // Technology row
      if (battery.technology) {
        rows.push(
          `<tr><th>Technology</th><td>${escapeHtml(
            battery.technology
          )}</td></tr>`
        );
      }

      // Health row
      if (battery.state_of_health_pct != null) {
        const healthPct = Number(battery.state_of_health_pct).toFixed(0);
        rows.push(
          `<tr><th>Health</th><td><span class="badge ${
            health.class
          }">${healthPct}%</span>${
            health.label
              ? ` <span class="muted" style="margin-left:8px;">${health.label}</span>`
              : ""
          }</td></tr>`
        );
      }

      // Details row
      if (details) {
        rows.push(`<tr><th>Details</th><td class="muted">${details}</td></tr>`);
      }

      // Time to full row
      if (battery.time_to_full_sec != null) {
        rows.push(
          `<tr><th>To full</th><td>${formatDuration(
            battery.time_to_full_sec
          )}</td></tr>`
        );
      }

      // Time to empty row
      if (battery.time_to_empty_sec != null) {
        rows.push(
          `<tr><th>To empty</th><td>${formatDuration(
            battery.time_to_empty_sec
          )}</td></tr>`
        );
      }

      return `
      <div class="table-block">
        <div class="table-wrap">
          <table class="table kv-table">
            <tbody>
              ${rows.join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * Renders a filtered list of relevant users in a compact table.
 * - Deduplicates names (case-insensitive)
 * - Filters out obvious system/service and machine accounts
 * @param {Object} info - System info object
 * @returns {string} HTML string for users section or empty string
 */
export function renderUsers(info) {
  const raw = Array.isArray(info.users) ? info.users : [];
  if (!raw.length) return "";

  // Normalize and deduplicate
  const seen = new Set();
  const normalized = [];
  for (const u of raw) {
    const name = String(u || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }

  // Filter out noisy/builtin accounts while preserving useful ones
  const skipPatterns = [
    /^defaultaccount$/i,
    /^guest$/i,
    /^wdagutilityaccount$/i,
    /^dwm-\d+$/i, // Desktop Window Manager sessions
    /\$$/, // machine account (ends with $)
    /^umfd-\d+$/i,
    /^local service$/i,
    /^network service$/i,
    /^system$/i,
  ];
  const isNoisy = (name) => skipPatterns.some((re) => re.test(name));

  const keep = normalized.filter((n) => !isNoisy(n));
  if (!keep.length) return "";

  const rows = keep
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((n) => `<tr><td>${escapeHtml(n)}</td></tr>`)
    .join("");

  return `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead><tr><th>Users (Logged In)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}
