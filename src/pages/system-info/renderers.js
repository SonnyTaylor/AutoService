/**
 * Render functions for different system information sections
 */

import {
  formatBytes,
  formatPct,
  formatDuration,
  escapeHtml,
} from "./formatters.js";
import { makeCollapsible } from "./ui.js";

/**
 * Renders the OS information section HTML.
 * @param {Object} info - System info object
 * @param {Object} ex - Extra Windows-specific data
 * @returns {string} HTML string for OS section
 */
export function renderOS(info, ex) {
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
export function renderSystem(info) {
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
export function renderMotherboard(info, ex) {
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
export function renderCPU(info) {
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
export function renderRAM(info, ex) {
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
export function renderGPU(info, ex) {
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
export function renderStorage(info, ex) {
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
export function renderNetwork(info) {
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
export function renderBattery(info) {
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
