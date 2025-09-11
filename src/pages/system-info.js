/**
 * System Information Page Module
 *
 * This module handles fetching, caching, and displaying comprehensive system
 * hardware and software information in a user-friendly web interface.
 * It provides collapsible sections for different system components with
 * real-time data visualization and refresh capabilities.
 *
 * Features:
 * - Session-based caching to avoid repeated system queries
 * - Collapsible sections for organized information display
 * - Real-time refresh functionality
 * - Windows-specific enhancements (OS caption, TPM, etc.)
 * - Responsive progress bars and badges for usage metrics
 * - Amazing spaghetti code 👽
 */

// Tauri API imports
const { invoke } = window.__TAURI__.core;
const { Command } = window.__TAURI__?.shell || {};

// DOM utility function
/**
 * Simple DOM query selector with optional root element.
 * @param {string} selector - CSS selector
 * @param {Element} root - Root element to search in (defaults to document)
 * @returns {Element|null} Found element or null
 */
function $(selector, root = document) {
  return root.querySelector(selector);
}

// Cache management constants and variables
const CACHE_KEY = "sysinfo.cache.v1";
const CACHE_TS_KEY = "sysinfo.cache.ts.v1";
let sysinfoCache = null; // Cached system info object
let sysinfoCacheTs = null; // Timestamp of cache (milliseconds)
let prewarmPromise = null; // Background fetch promise

/**
 * Loads cached system info from sessionStorage.
 */
function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const ts = Number(sessionStorage.getItem(CACHE_TS_KEY) || "");
    if (raw) {
      sysinfoCache = JSON.parse(raw);
      sysinfoCacheTs = Number.isFinite(ts) ? ts : null;
    }
  } catch (error) {
    console.warn("Failed to load system info cache:", error);
  }
}

/**
 * Saves system info to cache and sessionStorage.
 * @param {Object} info - System info object to cache
 * @param {number} ts - Timestamp in milliseconds
 */
function saveCache(info, ts) {
  sysinfoCache = info;
  sysinfoCacheTs = ts;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(info));
    sessionStorage.setItem(CACHE_TS_KEY, String(ts));
  } catch (error) {
    console.warn("Failed to save system info cache:", error);
  }
}

/**
 * Formats a timestamp to short time string (HH:MM).
 * @param {number} ms - Timestamp in milliseconds
 * @returns {string} Formatted time string or empty string
 */
function formatTimeShort(ms) {
  if (!ms) return "";
  try {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (error) {
    console.warn("Failed to format timestamp:", error);
    return "";
  }
}

/**
 * Updates the "last refreshed" label in the UI.
 * @param {Element} container - Container element to search for the label
 * @param {number} ms - Timestamp in milliseconds
 */
function setLastRefreshedLabel(container, ms) {
  const el = container.querySelector("#sysinfo-last-refreshed");
  if (!el) return;
  if (!ms) {
    el.textContent = "";
    return;
  }
  el.textContent = `Updated ${formatTimeShort(ms)}`;
}

/**
 * Creates HTML for a collapsible section.
 * @param {string} title - Section title
 * @param {string} contentHtml - HTML content for the section body
 * @returns {string} Complete HTML string for the collapsible section
 */
function makeCollapsible(title, contentHtml) {
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="collapsible" data-id="${id}">
      <div class="collapsible-header" role="button" tabindex="0" aria-expanded="true">
        <span class="chevron" aria-hidden="true" style="display:inline-block; width:1.2em;">▾</span>
        <span class="title">${escapeHtml(title)}</span>
      </div>
      <div class="collapsible-body">
        ${contentHtml}
      </div>
    </div>
  `;
}

/**
 * Initializes collapsible functionality for all headers in a container.
 * @param {Element} container - Container element containing collapsible sections
 */
function initCollapsibles(container) {
  const headers = container.querySelectorAll(".collapsible-header");
  headers.forEach((header) => {
    const onToggle = () => {
      const body = header.nextElementSibling;
      const chevron = header.querySelector(".chevron");
      const expanded = header.getAttribute("aria-expanded") === "true";
      header.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (body) body.style.display = expanded ? "none" : "";
      if (chevron) chevron.textContent = expanded ? "▸" : "▾";
    };
    header.addEventListener("click", onToggle);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    });
  });
}

/**
 * Formats bytes into human-readable units (B, KB, MB, etc.).
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string or "-" if invalid
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

/**
 * Formats a ratio as a percentage.
 * @param {number} n - Numerator
 * @param {number} total - Denominator
 * @returns {string} Percentage string or "-" if invalid
 */
function formatPct(n, total) {
  if (!total) return "-";
  return `${Math.round((n / total) * 100)}%`;
}

/**
 * Formats duration in seconds to human-readable string.
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string or "-" if null
 */
function formatDuration(seconds) {
  if (seconds == null) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Renders the OS information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for OS section
 */
function renderOS(info, ex) {
  const osExtraRows = [];

  // Domain information (Windows-specific)
  if (ex && Array.isArray(ex.computer_system) && ex.computer_system.length) {
    const cs = ex.computer_system[0] || {};
    if (cs?.Domain) {
      osExtraRows.push(
        `<tr><th>Domain</th><td>${escapeHtml(cs.Domain)}</td></tr>`
      );
    }
  }

  // Secure Boot status
  if (ex?.secure_boot) {
    osExtraRows.push(
      `<tr><th>Secure Boot</th><td>${escapeHtml(ex.secure_boot)}</td></tr>`
    );
  }

  // TPM information with JSON parsing
  if (ex?.tpm_summary) {
    let added = false;
    const raw = String(ex.tpm_summary || "").trim();
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object") {
        const parts = [];
        if (v.TpmPresent === true) parts.push("Present");
        else if (v.TpmPresent === false) parts.push("Not Present");
        if (v.TpmReady === true) parts.push("Ready");
        else if (v.TpmReady === false) parts.push("Not Ready");
        if (typeof v.SpecVersion === "string" && v.SpecVersion.trim()) {
          parts.push(`Spec ${v.SpecVersion}`);
        }
        if (
          typeof v.ManagedAuthLevel === "string" &&
          v.ManagedAuthLevel.trim()
        ) {
          parts.push(v.ManagedAuthLevel);
        }
        if (parts.length) {
          osExtraRows.push(
            `<tr><th>TPM</th><td>${escapeHtml(parts.join(" • "))}</td></tr>`
          );
          added = true;
        }
      }
    } catch (error) {
      console.warn("Failed to parse TPM summary:", error);
    }
    if (!added) {
      // Hide meaningless all-null objects, otherwise show trimmed text
      const compact = raw.replace(/\s+/g, "");
      const allNull =
        compact ===
        '{"TpmPresent":null,"TpmReady":null,"ManagedAuthLevel":null,"OwnerAuth":null,"SpecVersion":null}';
      if (raw && !allNull) {
        osExtraRows.push(`<tr><th>TPM</th><td>${escapeHtml(raw)}</td></tr>`);
      }
    }
  }

  // .NET version
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
function renderSystem(info) {
  if (!info.product) return "";

  const sysHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            ${
              info.product.vendor
                ? `<tr><th>Vendor</th><td>${escapeHtml(
                    info.product.vendor
                  )}</td></tr>`
                : ""
            }
            ${
              info.product.name
                ? `<tr><th>Model</th><td>${escapeHtml(
                    info.product.name
                  )}</td></tr>`
                : ""
            }
            ${
              info.product.family
                ? `<tr><th>Family</th><td>${escapeHtml(
                    info.product.family
                  )}</td></tr>`
                : ""
            }
            ${
              info.product.version
                ? `<tr><th>Version</th><td>${escapeHtml(
                    info.product.version
                  )}</td></tr>`
                : ""
            }
            ${
              info.product.serial_number
                ? `<tr><th>Serial</th><td>${escapeHtml(
                    info.product.serial_number
                  )}</td></tr>`
                : ""
            }
            ${
              info.product.sku
                ? `<tr><th>SKU</th><td>${escapeHtml(
                    info.product.sku
                  )}</td></tr>`
                : ""
            }
            ${
              info.product.uuid
                ? `<tr><th>UUID</th><td><code>${escapeHtml(
                    info.product.uuid
                  )}</code></td></tr>`
                : ""
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
  return sysHtml;
}

/**
 * Renders the motherboard information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for motherboard section or empty string if no data
 */
function renderMotherboard(info, ex) {
  if (!info.motherboard) return "";

  const biosRows = [];
  if (ex?.bios_vendor) {
    biosRows.push(
      `<tr><th>BIOS Vendor</th><td>${escapeHtml(ex.bios_vendor)}</td></tr>`
    );
  }
  if (ex?.bios_version) {
    biosRows.push(
      `<tr><th>BIOS Version</th><td>${escapeHtml(ex.bios_version)}</td></tr>`
    );
  }
  if (ex?.bios_release_date) {
    biosRows.push(
      `<tr><th>BIOS Release</th><td>${escapeHtml(
        ex.bios_release_date
      )}</td></tr>`
    );
  }

  const mbHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Vendor</th><td>${escapeHtml(
              info.motherboard.vendor || "-"
            )}</td></tr>
            ${
              info.motherboard.name
                ? `<tr><th>Model</th><td>${escapeHtml(
                    info.motherboard.name
                  )}</td></tr>`
                : ""
            }
            ${
              info.motherboard.version
                ? `<tr><th>Version</th><td>${escapeHtml(
                    info.motherboard.version
                  )}</td></tr>`
                : ""
            }
            ${
              info.motherboard.serial_number
                ? `<tr><th>Serial</th><td>${escapeHtml(
                    info.motherboard.serial_number
                  )}</td></tr>`
                : ""
            }
            ${
              info.motherboard.asset_tag
                ? `<tr><th>Asset Tag</th><td>${escapeHtml(
                    info.motherboard.asset_tag
                  )}</td></tr>`
                : ""
            }
            ${biosRows.join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return mbHtml;
}

/**
 * Renders the CPU information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for CPU section
 */
function renderCPU(info) {
  const cores = info.cpu.cores || [];
  const avgCpu = cores.length
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            cores.reduce((sum, core) => sum + (core.usage_percent || 0), 0) /
              cores.length
          )
        )
      )
    : null;

  const perCoreGrid = cores.length
    ? `
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
  `
    : "";

  const cpuHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Model</th><td>${escapeHtml(info.cpu.brand)}</td></tr>
            <tr><th>Vendor</th><td>${escapeHtml(
              info.cpu.vendor_id || "-"
            )}</td></tr>
            <tr><th>Cores / Threads</th><td>
              <span class="badge">Physical: ${
                info.cpu.num_physical_cores ?? "-"
              }C</span>
              <span class="badge" style="margin-left:6px;">Logical: ${
                info.cpu.num_logical_cpus
              }T</span>
            </td></tr>
            <tr><th>Frequency</th><td>${
              info.cpu.frequency_mhz
                ? (info.cpu.frequency_mhz / 1000).toFixed(2) + " GHz"
                : "-"
            }</td></tr>
            ${
              avgCpu != null
                ? `<tr><th>CPU Usage</th><td>${avgCpu}%<div class="progress" aria-label="cpu usage"><div class="bar" style="width:${avgCpu}%;"></div></div></td></tr>`
                : ""
            }
            ${
              perCoreGrid
                ? `<tr><th>Per-core usage</th><td>${perCoreGrid}</td></tr>`
                : ""
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
  return cpuHtml;
}

/**
 * Renders the RAM information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for RAM section
 */
function renderRAM(info, ex) {
  const usedMem = info.memory.used;
  const totalMem = info.memory.total || 1;
  const memPct = Math.min(100, Math.round((usedMem / totalMem) * 100));

  let dimmHtml = "";
  if (ex && Array.isArray(ex.ram_modules) && ex.ram_modules.length) {
    const mapFF = (n) => {
      const m = { 8: "DIMM", 12: "SODIMM" };
      return n in m ? m[n] : n != null ? String(n) : "-";
    };
    const dimmRows = ex.ram_modules
      .map((module) => {
        const cap = Number(module?.Capacity || 0);
        const speed = module?.Speed != null ? `${module.Speed} MHz` : "-";
        const volt =
          module?.ConfiguredVoltage != null
            ? `${Number(module.ConfiguredVoltage) / 1000} V`
            : "-";
        const dtype =
          module?.MemoryType != null ? String(module.MemoryType) : "-";
        const ff = mapFF(Number(module?.FormFactor));
        const width =
          module?.DataWidth != null || module?.TotalWidth != null
            ? `${module?.DataWidth ?? "-"}/${module?.TotalWidth ?? "-"}`
            : "-";
        return `<tr>
        <td>${escapeHtml(module?.BankLabel || "-")}</td>
        <td>${escapeHtml(module?.DeviceLocator || "-")}</td>
        <td>${formatBytes(cap)}</td>
        <td>${speed}</td>
        <td>${escapeHtml(module?.Manufacturer || "-")}</td>
        <td>${escapeHtml(module?.PartNumber || "-")}</td>
        <td>${escapeHtml(module?.SerialNumber || "-")}</td>
        <td>${dtype}</td>
        <td>${ff}</td>
        <td>${volt}</td>
        <td>${width}</td>
      </tr>`;
      })
      .join("");
    dimmHtml = `
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

  const ramHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table kv-table">
          <tbody>
            <tr><th>Usage</th><td>${formatBytes(usedMem)} / ${formatBytes(
    totalMem
  )} <span class="badge">${memPct}%</span>
              <div class="progress" aria-label="memory usage"><div class="bar" style="width:${memPct}%;"></div></div></td></tr>
            <tr><th>Free</th><td>${formatBytes(info.memory.free)}</td></tr>
            <tr><th>Swap</th><td>${formatBytes(
              info.memory.swap_used
            )} / ${formatBytes(info.memory.swap_total)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    ${dimmHtml}
  `;
  return ramHtml;
}

/**
 * Renders the GPU information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for GPU section
 */
function renderGPU(info, ex) {
  let gpuHtml = "";
  if (info.gpus && info.gpus.length) {
    const rows = info.gpus
      .map((gpu) => {
        const vendor = (gpu.vendor ?? null) !== null ? String(gpu.vendor) : "";
        const device = (gpu.device ?? null) !== null ? String(gpu.device) : "";
        const dtype = gpu.device_type || "";
        const driver = [gpu.driver, gpu.driver_info].filter(Boolean).join(" ");
        const backend = gpu.backend || "";
        return `<tr>
        <td>${escapeHtml(gpu.name)}</td>
        <td>${escapeHtml(vendor || "-")}</td>
        <td>${escapeHtml(device || "-")}</td>
        <td>${escapeHtml(dtype || "-")}</td>
        <td>${escapeHtml(driver || "-")}</td>
        <td>${escapeHtml(backend || "-")}</td>
      </tr>`;
      })
      .join("");
    gpuHtml = `
      <div class="table-block">
        <div class="table-wrap">
          <table class="table data-table">
            <thead><tr><th>Name</th><th>Vendor</th><th>Device</th><th>Type</th><th>Driver</th><th>Backend</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  } else if (ex && Array.isArray(ex.video_ctrl_ex) && ex.video_ctrl_ex.length) {
    const vRows = ex.video_ctrl_ex
      .map(
        (v) => `<tr>
      <td>${escapeHtml(v?.Name || "-")}</td>
      <td>${v?.AdapterRAM ? formatBytes(Number(v.AdapterRAM)) : "-"}</td>
      <td>${escapeHtml(v?.DriverVersion || "-")}</td>
      <td>${escapeHtml(v?.VideoModeDescription || "-")}</td>
    </tr>`
      )
      .join("");
    gpuHtml = `
      <div class="table-block">
        <div class="table-wrap">
          <table class="table data-table">
            <thead><tr><th>Name</th><th>VRAM</th><th>Driver</th><th>Mode</th></tr></thead>
            <tbody>${vRows}</tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    gpuHtml = `
      <div class="table-block">
        <div class="table-wrap">
          <div class="empty-state">No GPU info available</div>
        </div>
      </div>
    `;
  }
  return gpuHtml;
}

/**
 * Renders the storage information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for storage section
 */
function renderStorage(info, ex) {
  let storageHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr>
              <th>Name</th><th>Mount</th><th>FS</th><th>Flags</th><th>Usage</th><th>IO</th>
            </tr>
          </thead>
          <tbody>
            ${info.disks
              .map((disk) => {
                const used = Math.max(
                  0,
                  disk.total_space - disk.available_space
                );
                const pct = disk.total_space
                  ? Math.min(100, Math.round((used / disk.total_space) * 100))
                  : 0;
                const flags = [
                  `${disk.is_removable ? "Removable" : ""}`,
                  `${disk.is_read_only ? "Read-only" : ""}`,
                  `${disk.kind ? escapeHtml(disk.kind) : ""}`,
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
                  ${formatBytes(used)} / ${formatBytes(
                  disk.total_space
                )} <span class="badge">${pct}%</span>
                  <div class="progress" aria-label="disk usage"><div class="bar" style="width:${pct}%;"></div></div>
                </td>
                <td>R:${formatBytes(disk.read_bytes)} • W:${formatBytes(
                  disk.written_bytes
                )}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  if (ex && Array.isArray(ex.disk_drives) && ex.disk_drives.length) {
    const ddRows = ex.disk_drives
      .map(
        (drive) => `<tr>
      <td>${escapeHtml(drive?.Model || "-")}</td>
      <td>${escapeHtml(drive?.InterfaceType || "-")}</td>
      <td>${escapeHtml(drive?.MediaType || "-")}</td>
      <td>${drive?.Size ? formatBytes(Number(drive.Size)) : "-"}</td>
    </tr>`
      )
      .join("");
    storageHtml += `
      <div class="table-block">
        <div class="table-wrap">
          <table class="table data-table">
            <thead>
              <tr><th>Model</th><th>Interface</th><th>Media Type</th><th>Size</th></tr>
            </thead>
            <tbody>${ddRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }
  return storageHtml;
}

/**
 * Renders the network information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for network section
 */
function renderNetwork(info) {
  const netHtml = `
    <div class="table-block">
      <div class="table-wrap">
        <table class="table data-table">
          <thead>
            <tr>
              <th>Interface</th><th>MAC</th><th>MTU</th><th>IPs</th><th>Totals</th><th>Δ</th><th>Errors</th>
            </tr>
          </thead>
          <tbody>
            ${info.networks
              .map(
                (network) => `
            <tr>
              <td>${escapeHtml(network.interface)}</td>
              <td>${network.mac ? escapeHtml(network.mac) : "-"}</td>
              <td>${network.mtu}</td>
              <td>${network.ips.map(escapeHtml).join("<br>")}</td>
              <td>Rx ${formatBytes(network.total_received)}<br>Tx ${formatBytes(
                  network.total_transmitted
                )}</td>
              <td>Rx ${formatBytes(network.received)} • Tx ${formatBytes(
                  network.transmitted
                )}</td>
              <td>${
                network.errors_rx || network.errors_tx
                  ? `${network.errors_rx}/${network.errors_tx}`
                  : "-"
              }</td>
            </tr>
          `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return netHtml;
}

/**
 * Renders the battery information section HTML.
 * @param {Object} info - System info object
 * @returns {string} HTML string for battery section
 */
function renderBattery(info) {
  const batteries = Array.isArray(info.batteries)
    ? info.batteries
    : info.battery
    ? [info.battery]
    : [];

  let battHtml = "";
  if (!batteries.length) {
    battHtml = `
      <div class="table-block">
        <div class="table-wrap">
          <div class="empty-state">No batteries detected</div>
        </div>
      </div>
    `;
  } else {
    battHtml = batteries
      .map((battery, index) => {
        const pct = battery.percentage ?? 0;
        const stateBadgeClass = pct >= 50 ? "ok" : pct >= 20 ? "" : "warn";
        const idBits = [battery.vendor, battery.model]
          .filter(Boolean)
          .join(" ");
        const details = [
          battery.cycle_count != null ? `${battery.cycle_count} cycles` : null,
          battery.voltage_v != null
            ? `${battery.voltage_v.toFixed(2)} V`
            : null,
          battery.energy_full_wh != null
            ? `Full ${battery.energy_full_wh.toFixed(1)} Wh`
            : null,
          battery.energy_full_design_wh != null
            ? `Design ${battery.energy_full_design_wh.toFixed(1)} Wh`
            : null,
        ]
          .filter(Boolean)
          .join(" • ");

        const healthPct = battery.state_of_health_pct;
        const healthClass =
          healthPct == null
            ? ""
            : healthPct >= 80
            ? "ok"
            : healthPct >= 60
            ? ""
            : "warn";
        const healthLabel =
          healthPct == null
            ? ""
            : healthPct >= 80
            ? "Good"
            : healthPct >= 60
            ? "Fair"
            : "Poor";

        return `
      <div class="table-block">
        <div class="table-wrap">
          <table class="table kv-table">
            <tbody>
              <tr><th>Charge ${
                batteries.length > 1 ? `(Battery ${index + 1})` : ""
              }</th>
                <td><span class="badge ${stateBadgeClass}">${pct.toFixed(
          0
        )}%</span>
                  <span class="muted" style="margin-left:8px;">${escapeHtml(
                    battery.state || "-"
                  )}</span></td></tr>
              ${
                idBits
                  ? `<tr><th>Identity</th><td>${escapeHtml(idBits)}</td></tr>`
                  : ""
              }
              ${
                battery.serial
                  ? `<tr><th>Serial</th><td>${escapeHtml(
                      battery.serial
                    )}</td></tr>`
                  : ""
              }
              ${
                battery.technology
                  ? `<tr><th>Technology</th><td>${escapeHtml(
                      battery.technology
                    )}</td></tr>`
                  : ""
              }
              ${
                healthPct != null
                  ? `<tr><th>Health</th><td><span class="badge ${healthClass}">${Number(
                      healthPct
                    ).toFixed(0)}%</span>${
                      healthLabel
                        ? ` <span class="muted" style="margin-left:8px;">${healthLabel}</span>`
                        : ""
                    }</td></tr>`
                  : ""
              }
              ${
                details
                  ? `<tr><th>Details</th><td class="muted">${details}</td></tr>`
                  : ""
              }
              ${
                battery.time_to_full_sec != null
                  ? `<tr><th>To full</th><td>${formatDuration(
                      battery.time_to_full_sec
                    )}</td></tr>`
                  : ""
              }
              ${
                battery.time_to_empty_sec != null
                  ? `<tr><th>To empty</th><td>${formatDuration(
                      battery.time_to_empty_sec
                    )}</td></tr>`
                  : ""
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
      })
      .join("");
  }
  return battHtml;
}

/**
 * Main render function that builds the entire system info UI.
 * @param {Object} info - System info object from Tauri backend
 */
function render(info) {
  const root = document.querySelector('[data-page="system-info"]');
  if (!root) return;

  const ex = info.extra || null;

  // Find or create the main section
  const section = document.querySelector(
    'section.page[data-page="system-info"]'
  );
  section.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; justify-content: space-between; flex-wrap: wrap;">
      <div>
        <h1 style="margin-bottom:4px;">System Info</h1>
        <p class="muted" style="margin:0;">Hardware, software, and drivers at a glance.</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap: wrap;">
        <button id="sysinfo-toggle-all-btn" class="ghost">Collapse all</button>
        <button id="sysinfo-refresh-btn" class="ghost">Refresh</button>
        <span id="sysinfo-last-refreshed" class="muted" style="font-size:.85rem; align-self:center;"></span>
      </div>
    </div>
  `;

  // Render each section
  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("OS Info", renderOS(info, ex))
  );

  const systemHtml = renderSystem(info);
  if (systemHtml) {
    section.insertAdjacentHTML(
      "beforeend",
      makeCollapsible("System", systemHtml)
    );
  }

  const motherboardHtml = renderMotherboard(info, ex);
  if (motherboardHtml) {
    section.insertAdjacentHTML(
      "beforeend",
      makeCollapsible("Motherboard", motherboardHtml)
    );
  }

  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("CPU", renderCPU(info))
  );
  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("RAM", renderRAM(info, ex))
  );
  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("GPU", renderGPU(info, ex))
  );
  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("Storage", renderStorage(info, ex))
  );
  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("Network", renderNetwork(info))
  );
  section.insertAdjacentHTML(
    "beforeend",
    makeCollapsible("Battery", renderBattery(info))
  );

  // Bind refresh button
  const btn = document.getElementById("sysinfo-refresh-btn");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner sm" aria-hidden="true"></span><span style="margin-left:8px;">Refreshing…</span>';
      try {
        const data = await invoke("get_system_info");
        // Windows OS caption enhancement
        if (Command && navigator.userAgent.includes("Windows")) {
          try {
            const psArgs = [
              "-NoProfile",
              "-ExecutionPolicy",
              "Bypass",
              "-Command",
              "wmic os get Caption | more +1",
            ];
            const cmd = await Command.create("powershell", psArgs).execute();
            const osCaption = (cmd?.stdout || "").trim();
            if (osCaption) data.os = osCaption;
          } catch (error) {
            console.warn("Failed to get Windows OS caption:", error);
          }
        }
        const now = Date.now();
        saveCache(data, now);
        render(data);
      } catch (error) {
        console.error("Failed to refresh system info:", error);
      }
    });
  }

  // Initialize collapsibles
  initCollapsibles(section);
  setLastRefreshedLabel(section, sysinfoCacheTs);

  // Toggle all functionality
  const toggleAllBtn = document.getElementById("sysinfo-toggle-all-btn");
  const headers = Array.from(section.querySelectorAll(".collapsible-header"));

  const updateToggleAllLabel = () => {
    const allExpanded =
      headers.length &&
      headers.every((h) => h.getAttribute("aria-expanded") === "true");
    if (toggleAllBtn)
      toggleAllBtn.textContent = allExpanded ? "Collapse all" : "Expand all";
  };

  updateToggleAllLabel();

  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      const allExpanded =
        headers.length &&
        headers.every((h) => h.getAttribute("aria-expanded") === "true");
      const target = !allExpanded;
      headers.forEach((header) => {
        header.setAttribute("aria-expanded", target ? "true" : "false");
        const body = header.nextElementSibling;
        const chevron = header.querySelector(".chevron");
        if (body) body.style.display = target ? "" : "none";
        if (chevron) chevron.textContent = target ? "▾" : "▸";
      });
      updateToggleAllLabel();
    });

    // Keep toggle label in sync when individual sections are toggled
    section.addEventListener("click", (e) => {
      if (e.target.closest(".collapsible-header"))
        setTimeout(updateToggleAllLabel, 0);
    });
    section.addEventListener("keydown", (e) => {
      if (
        (e.key === "Enter" || e.key === " ") &&
        e.target.closest(".collapsible-header")
      ) {
        setTimeout(updateToggleAllLabel, 0);
      }
    });
  }
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        char
      ])
  );
}

/**
 * Initializes the system info page.
 * Loads cached data or fetches fresh data and renders the UI.
 * @returns {Promise<void>}
 */
export async function initPage() {
  const container = document.querySelector('[data-page="system-info"]');
  if (!container) return;

  const skel = document.createElement("div");
  skel.className = "loading center";
  skel.innerHTML = `
    <div class="spinner" aria-hidden="true"></div>
    <div>
      <div class="loading-title">Loading system information…</div>
      <div class="muted">Collecting hardware and OS details</div>
    </div>
  `;
  container.appendChild(skel);

  try {
    // Load from cache if available
    if (sysinfoCache == null) loadCache();
    if (sysinfoCache) {
      render(sysinfoCache);
      return;
    }

    // Fetch fresh data
    const info = await invoke("get_system_info");

    // Windows OS caption enhancement
    if (Command && navigator.userAgent.includes("Windows")) {
      try {
        const psArgs = [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "wmic os get Caption | more +1",
        ];
        const cmd = await Command.create("powershell", psArgs).execute();
        const osCaption = (cmd?.stdout || "").trim();
        if (osCaption) info.os = osCaption;
      } catch (error) {
        console.warn("Failed to get Windows OS caption:", error);
      }
    }

    const now = Date.now();
    saveCache(info, now);
    render(info);
  } catch (error) {
    container.innerHTML = `
      <section class="page">
        <h1>System Info</h1>
        <p class="muted">Failed to read system information.</p>
      </section>
    `;
    console.error("Failed to initialize system info page:", error);
  }
}

/**
 * Prewarms system info by fetching data in the background.
 * Useful for instant loading on first navigation.
 * @param {Object} options - Options object
 * @param {boolean} options.force - Force refresh even if cached
 * @returns {Promise<Object>} Promise resolving to system info object
 */
export function prewarmSystemInfo({ force = false } = {}) {
  // Return cached data if available and not forcing
  if (!force && sysinfoCache) return Promise.resolve(sysinfoCache);

  if (prewarmPromise) return prewarmPromise;

  // Start background fetch
  prewarmPromise = (async () => {
    try {
      const info = await invoke("get_system_info");

      // Windows OS caption enhancement
      if (Command && navigator.userAgent.includes("Windows")) {
        try {
          const psArgs = [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "wmic os get Caption | more +1",
          ];
          const cmd = await Command.create("powershell", psArgs).execute();
          const osCaption = (cmd?.stdout || "").trim();
          if (osCaption) info.os = osCaption;
        } catch (error) {
          console.warn("Failed to get Windows OS caption:", error);
        }
      }

      saveCache(info, Date.now());
      return info;
    } catch (error) {
      prewarmPromise = null; // Reset on failure for retry
      throw error;
    }
  })();

  return prewarmPromise;
}
