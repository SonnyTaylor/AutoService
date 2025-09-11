/**
 * Initializes the Shortcuts page by setting up the UI, event listeners, and rendering shortcuts.
 * This function handles the display of categorized Windows system tools and utilities,
 * provides search functionality, and manages the invocation of shortcuts via Tauri backend.
 *
 * @async
 * @returns {Promise<void>} Resolves when the page initialization is complete.
 */
export async function initPage() {
  const { invoke } = window.__TAURI__.core;

  /**
   * Array of shortcut categories, each containing a title and a list of items.
   * Each item has an id (used for backend invocation), label (display text), and icon (Phosphor icon name).
   * @type {Array<{title: string, items: Array<{id: string, label: string, icon: string}>}>}
   */
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

  // DOM elements for the shortcuts list, search input, and clear button
  const shortcutsContainer = document.getElementById("shortcut-list");
  const searchInput = document.getElementById("shortcut-search");
  const clearSearchButton = document.getElementById("clear-search");

  /**
   * Renders the list of categories and their shortcuts into the DOM.
   * Clears the container and rebuilds the UI based on the provided categories.
   *
   * @param {Array} categoriesList - The list of categories to render.
   */
  function renderShortcuts(categoriesList) {
    shortcutsContainer.innerHTML = ""; // Clear existing content

    categoriesList.forEach((category) => {
      const categorySection = createCategorySection(category);
      shortcutsContainer.appendChild(categorySection);
    });
  }

  /**
   * Creates a DOM section element for a category, including its header and grid of shortcuts.
   *
   * @param {Object} category - The category object with title and items.
   * @param {string} category.title - The title of the category.
   * @param {Array} category.items - The list of shortcut items.
   * @returns {HTMLElement} The created section element.
   */
  function createCategorySection(category) {
    const section = document.createElement("section");
    section.className = "category";
    section.innerHTML = `
      <div class="category-header"><h2>${category.title}</h2></div>
      <div class="shortcut-grid"></div>
    `;

    const grid = section.querySelector(".shortcut-grid");
    category.items.forEach((item) => {
      const button = createShortcutButton(item);
      grid.appendChild(button);
    });

    return section;
  }

  /**
   * Creates a button element for a shortcut item, including icon, label, and click handler.
   *
   * @param {Object} item - The shortcut item with id, label, and icon.
   * @param {string} item.id - The unique identifier for the shortcut.
   * @param {string} item.label - The display label for the shortcut.
   * @param {string} item.icon - The Phosphor icon name.
   * @returns {HTMLElement} The created button element.
   */
  function createShortcutButton(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-btn";
    button.title = item.label;
    // Allow text wrapping for better layout on smaller screens
    button.style.whiteSpace = "normal";
    button.style.wordBreak = "break-word";

    // Create and append the icon element
    const iconElement = document.createElement("i");
    const iconClass = convertIconNameToKebabCase(item.icon || "Gear");
    iconElement.className = `ph ph-${iconClass} ph-icon`;
    button.appendChild(iconElement);

    // Create and append the text span
    const textSpan = document.createElement("span");
    textSpan.textContent = item.label;
    button.appendChild(textSpan);

    // Add click event listener to invoke the shortcut via Tauri backend
    button.addEventListener("click", async () => {
      button.disabled = true; // Disable button during invocation
      try {
        await invoke("launch_shortcut", { id: item.id });
      } catch (error) {
        console.error("Error launching shortcut:", error);
        alert(`Failed to launch: ${item.label}`);
      } finally {
        button.disabled = false; // Re-enable button
      }
    });

    return button;
  }

  /**
   * Converts a PascalCase icon name to kebab-case for CSS class usage.
   *
   * @param {string} iconName - The icon name in PascalCase.
   * @returns {string} The icon name in kebab-case.
   */
  function convertIconNameToKebabCase(iconName) {
    return iconName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * Filters the categories based on a search query.
   * Returns categories that have items matching the query (case-insensitive).
   *
   * @param {string} query - The search query string.
   * @returns {Array} The filtered list of categories.
   */
  function filterCategoriesByQuery(query) {
    if (!query) return CATEGORIES;

    const lowerQuery = query.toLowerCase();
    return CATEGORIES.map((category) => ({
      title: category.title,
      items: category.items.filter((item) =>
        item.label.toLowerCase().includes(lowerQuery)
      ),
    })).filter((category) => category.items.length > 0);
  }

  // Initial render of all categories
  renderShortcuts(CATEGORIES);

  // Set up search input event listener for dynamic filtering
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const filteredCategories = filterCategoriesByQuery(searchInput.value);
      renderShortcuts(filteredCategories);
    });
  }

  // Set up clear search button event listener
  if (clearSearchButton) {
    clearSearchButton.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      renderShortcuts(CATEGORIES);
      searchInput.focus();
    });
  }
}
