// Controller for Shortcuts page: renders categories and wires up search + invoke
export async function initPage() {
  const { invoke } = window.__TAURI__.core;

  const CATEGORIES = [
    {
      title: "Control Panel & Settings",
      items: [
        { id: "control_panel", label: "Control Panel", icon: "SquaresFour" },
        {
          id: "power_options",
          label: "Power Options",
          icon: "BatteryCharging",
        },
        {
          id: "programs_features",
          label: "Programs & Features",
          icon: "ListChecks",
        },
        { id: "internet_options", label: "Internet Options", icon: "Globe" },
        { id: "printers", label: "Devices & Printers", icon: "Printer" },
        {
          id: "network_connections",
          label: "Network Connections",
          icon: "Network",
        },
        {
          id: "firewall_control",
          label: "Windows Firewall (Control)",
          icon: "Shield",
        },
        {
          id: "user_accounts_advanced",
          label: "User Accounts (Advanced)",
          icon: "Users",
        },
        { id: "netplwiz", label: "Netplwiz", icon: "User" },
        {
          id: "settings_power_sleep",
          label: "Settings: Power & Sleep",
          icon: "MoonStars",
        },
        {
          id: "settings_update",
          label: "Settings: Windows Update",
          icon: "ArrowClockwise",
        },
        {
          id: "settings_apps_features",
          label: "Settings: Apps & Features",
          icon: "AppWindow",
        },
        {
          id: "settings_network",
          label: "Settings: Network",
          icon: "WifiHigh",
        },
      ],
    },
    {
      title: "Management Consoles",
      items: [
        { id: "device_manager", label: "Device Manager", icon: "Devices" },
        { id: "disk_management", label: "Disk Management", icon: "HardDrive" },
        { id: "services", label: "Services", icon: "Wrench" },
        { id: "event_viewer", label: "Event Viewer", icon: "CalendarCheck" },
        {
          id: "computer_management",
          label: "Computer Management",
          icon: "Desktop",
        },
        {
          id: "performance_monitor",
          label: "Performance Monitor",
          icon: "Activity",
        },
        { id: "resource_monitor", label: "Resource Monitor", icon: "Graph" },
        {
          id: "firewall_advanced",
          label: "Windows Defender Firewall (Advanced)",
          icon: "ShieldCheck",
        },
        {
          id: "local_users_groups",
          label: "Local Users and Groups",
          icon: "UsersThree",
        },
        {
          id: "local_security_policy",
          label: "Local Security Policy",
          icon: "LockKey",
        },
        { id: "group_policy", label: "Group Policy Editor", icon: "Folders" },
      ],
    },
    {
      title: "System Tools",
      items: [
        { id: "task_manager", label: "Task Manager", icon: "ListDashes" },
        {
          id: "system_properties",
          label: "System Properties",
          icon: "Sliders",
        },
        {
          id: "system_information",
          label: "System Information (msinfo32)",
          icon: "Info",
        },
        {
          id: "directx_diag",
          label: "DirectX Diagnostic (dxdiag)",
          icon: "Cube",
        },
        { id: "disk_cleanup", label: "Disk Cleanup", icon: "Broom" },
        {
          id: "windows_features",
          label: "Windows Features",
          icon: "PuzzlePiece",
        },
        {
          id: "optimize_drives",
          label: "Optimize Drives (Defrag)",
          icon: "ArrowFatLinesDown",
        },
        {
          id: "system_config",
          label: "System Configuration (msconfig)",
          icon: "GearSix",
        },
        { id: "diskpart", label: "DiskPart", icon: "Database" },
        {
          id: "about_windows",
          label: "About Windows (winver)",
          icon: "WindowsLogo",
        },
        {
          id: "registry_editor",
          label: "Registry Editor",
          icon: "BracketsAngle",
        },
      ],
    },
    {
      title: "Consoles",
      items: [
        { id: "cmd", label: "Command Prompt", icon: "Terminal" },
        { id: "cmd_admin", label: "Command Prompt (Admin)", icon: "Terminal" },
        { id: "powershell", label: "PowerShell", icon: "TerminalWindow" },
        {
          id: "powershell_admin",
          label: "PowerShell (Admin)",
          icon: "TerminalWindow",
        },
      ],
    },
    {
      title: "Utilities",
      items: [
        { id: "notepad", label: "Notepad", icon: "NotePencil" },
        { id: "calculator", label: "Calculator", icon: "Calculator" },
        { id: "snipping_tool", label: "Snipping Tool", icon: "Scissors" },
        { id: "paint", label: "Paint", icon: "PaintBrushBroad" },
        { id: "character_map", label: "Character Map", icon: "TextT" },
        {
          id: "remote_desktop",
          label: "Remote Desktop (mstsc)",
          icon: "DesktopTower",
        },
        {
          id: "remote_assistance",
          label: "Remote Assistance",
          icon: "Handshake",
        },
        {
          id: "on_screen_keyboard",
          label: "On-Screen Keyboard",
          icon: "Keyboard",
        },
        { id: "magnifier", label: "Magnifier", icon: "MagnifyingGlass" },
        { id: "narrator", label: "Narrator", icon: "SpeakerHigh" },
        {
          id: "msrt",
          label: "Windows Malicious Software Removal Tool",
          icon: "BugBeetle",
        },
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
        btn.title = item.label;
        // Allow wrapping on larger buttons
        btn.style.whiteSpace = "normal";
        btn.style.wordBreak = "break-word";
        const iconEl = document.createElement("i");
        // Convert PascalCase icon name to kebab-case for phosphor web classes
        const kebab = (item.icon || "Gear")
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase();
        iconEl.className = `ph ph-${kebab} ph-icon`;
        const spanText = document.createElement("span");
        spanText.textContent = item.label;
        btn.appendChild(iconEl);
        btn.appendChild(spanText);
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
    return CATEGORIES.map((cat) => ({
      title: cat.title,
      items: cat.items.filter((it) => it.label.toLowerCase().includes(s)),
    })).filter((cat) => cat.items.length > 0);
  }

  render(CATEGORIES);
  search?.addEventListener("input", () =>
    render(filterCategories(search.value))
  );
  clearBtn?.addEventListener("click", () => {
    if (!search) return;
    search.value = "";
    render(CATEGORIES);
    search.focus();
  });
}
