// Controller for Shortcuts page: renders categories and wires up search + invoke
export async function initPage() {
  const { invoke } = window.__TAURI__.core;

  const CATEGORIES = [
    {
      title: "Control Panel & Settings",
      items: [
        { id: "control_panel", label: "Control Panel" },
        { id: "power_options", label: "Power Options" },
        { id: "programs_features", label: "Programs & Features" },
        { id: "internet_options", label: "Internet Options" },
        { id: "printers", label: "Devices & Printers" },
        { id: "network_connections", label: "Network Connections" },
        { id: "firewall_control", label: "Windows Firewall (Control)" },
        { id: "user_accounts_advanced", label: "User Accounts (Advanced)" },
        { id: "netplwiz", label: "Netplwiz" },
        { id: "settings_power_sleep", label: "Settings: Power & Sleep" },
        { id: "settings_update", label: "Settings: Windows Update" },
        { id: "settings_apps_features", label: "Settings: Apps & Features" },
        { id: "settings_network", label: "Settings: Network" },
      ],
    },
    {
      title: "Management Consoles",
      items: [
        { id: "device_manager", label: "Device Manager" },
        { id: "disk_management", label: "Disk Management" },
        { id: "services", label: "Services" },
        { id: "event_viewer", label: "Event Viewer" },
        { id: "computer_management", label: "Computer Management" },
        { id: "performance_monitor", label: "Performance Monitor" },
        { id: "resource_monitor", label: "Resource Monitor" },
        { id: "firewall_advanced", label: "Windows Defender Firewall (Advanced)" },
        { id: "local_users_groups", label: "Local Users and Groups" },
        { id: "local_security_policy", label: "Local Security Policy" },
        { id: "group_policy", label: "Group Policy Editor" },
      ],
    },
    {
      title: "System Tools",
      items: [
        { id: "task_manager", label: "Task Manager" },
        { id: "system_properties", label: "System Properties" },
        { id: "system_information", label: "System Information (msinfo32)" },
        { id: "directx_diag", label: "DirectX Diagnostic (dxdiag)" },
        { id: "disk_cleanup", label: "Disk Cleanup" },
        { id: "windows_features", label: "Windows Features" },
        { id: "optimize_drives", label: "Optimize Drives (Defrag)" },
        { id: "system_config", label: "System Configuration (msconfig)" },
        { id: "diskpart", label: "DiskPart" },
        { id: "about_windows", label: "About Windows (winver)" },
        { id: "registry_editor", label: "Registry Editor" },
      ],
    },
    {
      title: "Consoles",
      items: [
        { id: "cmd", label: "Command Prompt" },
        { id: "cmd_admin", label: "Command Prompt (Admin)" },
        { id: "powershell", label: "PowerShell" },
        { id: "powershell_admin", label: "PowerShell (Admin)" },
      ],
    },
    {
      title: "Utilities",
      items: [
        { id: "notepad", label: "Notepad" },
        { id: "calculator", label: "Calculator" },
        { id: "snipping_tool", label: "Snipping Tool" },
        { id: "paint", label: "Paint" },
        { id: "character_map", label: "Character Map" },
        { id: "remote_desktop", label: "Remote Desktop (mstsc)" },
        { id: "remote_assistance", label: "Remote Assistance" },
        { id: "on_screen_keyboard", label: "On-Screen Keyboard" },
        { id: "magnifier", label: "Magnifier" },
        { id: "narrator", label: "Narrator" },
        { id: "msrt", label: "Windows Malicious Software Removal Tool" },
      ],
    },
  ];

  const container = document.getElementById("shortcut-list");
  const search = document.getElementById("shortcut-search");
  const clearBtn = document.getElementById("clear-search");

  function render(list) {
    container.innerHTML = "";
    for (const cat of list) {
      const section = document.createElement("section");
      section.className = "category";
      section.innerHTML = `
        <div class="category-header"><h2>${cat.title}</h2></div>
        <div class="shortcut-grid"></div>
      `;
      const grid = section.querySelector(".shortcut-grid");
      for (const item of cat.items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shortcut-btn";
        btn.textContent = item.label;
        btn.title = item.label;
        // Allow wrapping on larger buttons
        btn.style.whiteSpace = "normal";
        btn.style.wordBreak = "break-word";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await invoke("launch_shortcut", { id: item.id });
          } catch (e) {
            console.error(e);
            alert(`Failed to launch: ${item.label}`);
          } finally {
            btn.disabled = false;
          }
        });
        grid.appendChild(btn);
      }
      container.appendChild(section);
    }
  }

  function filterCategories(q) {
    if (!q) return CATEGORIES;
    const s = q.toLowerCase();
    return CATEGORIES.map(cat => ({
      title: cat.title,
      items: cat.items.filter(it => it.label.toLowerCase().includes(s)),
    })).filter(cat => cat.items.length > 0);
  }

  render(CATEGORIES);
  search?.addEventListener("input", () => render(filterCategories(search.value)));
  clearBtn?.addEventListener("click", () => {
    if (!search) return;
    search.value = "";
    render(CATEGORIES);
    search.focus();
  });
}
