// Settings page controller for required external tools
const { invoke } = window.__TAURI__.core;
const { Command } = window.__TAURI__?.shell || {};

/**
 * Configuration for required external tools.
 * Each tool has a unique key, display name, match patterns for detection,
 * and a hint for the expected executable name.
 * @type {Array<{key: string, name: string, match: string[], hint: string, detector?: Function}>}
 */
const REQUIRED_TOOLS = [
  {
    key: "adwcleaner",
    name: "AdwCleaner",
    match: ["adwcleaner"],
    hint: "adwcleaner.exe",
  },
  {
    key: "bleachbit",
    name: "BleachBit",
    match: ["bleachbit"],
    hint: "bleachbit.exe",
  },
  // Prefer the CLI smartctl.exe explicitly; avoid matching gsmartcontrol.exe
  {
    key: "smartctl",
    name: "smartctl",
    match: ["smartctl.exe", " smartctl "],
    hint: "smartctl.exe",
  },
  {
    key: "heavyload",
    name: "HeavyLoad",
    match: ["heavyload", "heavyload.exe"],
    hint: "heavyload.exe",
  },
  // Prefer CLI furmark.exe; avoid FurMark_GUI.exe
  {
    key: "furmark",
    name: "FurMark",
    match: ["furmark.exe", " furmark "],
    hint: "furmark.exe",
  },
];

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        char
      ])
  );
}

/**
 * Loads the list of installed programs from the backend.
 * @returns {Promise<Array>} Array of program entries.
 */
async function loadProgramsFile() {
  try {
    return await invoke("list_programs");
  } catch {
    return [];
  }
}

/**
 * Performs fuzzy matching to find if a program entry matches any of the given names.
 * Excludes GUI variants for certain tools.
 * @param {Object} entry - Program entry with name, description, and exe_path.
 * @param {string[]} names - Array of names to match against.
 * @returns {boolean} True if the entry matches, false otherwise.
 */
function fuzzyMatch(entry, names) {
  const searchText =
    `${entry.name} ${entry.description} ${entry.exe_path}`.toLowerCase();
  const includesMatch = names.some((name) =>
    searchText.includes(name.toLowerCase())
  );

  if (!includesMatch) return false;

  // Exclude GUI variants when matching FurMark
  if (searchText.includes("furmark_gui.exe")) return false;
  // Exclude gsmartcontrol.exe for smartctl requirement
  if (searchText.includes("gsmartcontrol.exe")) return false;

  return true;
}

/**
 * Opens a file dialog to select an executable file.
 * @param {string} [defaultPath] - The default directory to open the dialog in.
 * @returns {Promise<string|null>} The selected file path or null if cancelled.
 */
async function pickExe(defaultPath) {
  const openDialog = window.__TAURI__?.dialog?.open;
  if (!openDialog) return null;

  return await openDialog({
    multiple: false,
    title: "Select executable",
    defaultPath,
    filters: [{ name: "Executables", extensions: ["exe"] }],
  });
}

/**
 * Detects the path to Windows Defender's MpCmdRun.exe.
 * @returns {Promise<string|null>} The path to MpCmdRun.exe or null if not found.
 */
async function detectDefender() {
  if (!Command) return null;

  try {
    const command = await Command.create("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "(Get-ChildItem -Path \"$env:ProgramData\\Microsoft\\Windows Defender\\Platform\" -Directory | Sort-Object Name -Descending | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName 'MpCmdRun.exe' })",
    ]).execute();

    const path = (command.stdout || "").trim();
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Finds the paths of required tools by matching against installed programs.
 * @param {Array} programEntries - Array of installed program entries.
 * @returns {Object} Map of tool keys to their executable paths.
 */
async function findRequiredTools(programEntries) {
  const foundTools = Object.create(null);

  for (const tool of REQUIRED_TOOLS) {
    const matchingEntry = programEntries.find((entry) =>
      fuzzyMatch(entry, tool.match)
    );

    if (matchingEntry && matchingEntry.exe_path) {
      foundTools[tool.key] = matchingEntry.exe_path;
    } else if (tool.detector) {
      // Run detector for dynamic tools like Defender
      foundTools[tool.key] = await tool.detector();
    }
  }

  return foundTools;
}

/**
 * Generates HTML for a tool status row.
 * @param {Object} tool - Tool configuration object.
 * @param {string} path - Path to the tool executable.
 * @returns {string} HTML string for the row.
 */
function generateToolRowHtml(tool, path) {
  const isFound = !!path;
  const statusBadge = isFound
    ? '<span class="badge ok">Found</span>'
    : '<span class="badge error">Missing</span>';

  const pathDisplay = path
    ? `<div class="muted" title="${escapeHtml(path)}">${escapeHtml(path)}</div>`
    : `<div class="muted">${escapeHtml(tool.hint || "")}</div>`;

  const locateButton = isFound
    ? ""
    : '<button class="secondary" data-action="locate">Locate</button>';

  return `
    <div class="row" data-key="${tool.key}">
      <div class="main">
        <div class="name">${escapeHtml(tool.name)} ${statusBadge}</div>
        ${pathDisplay}
      </div>
      <div class="meta">${locateButton}</div>
    </div>
  `;
}

/**
 * Renders the list of required programs in the UI.
 */
async function renderRequiredPrograms() {
  const listElement = document.getElementById("req-programs-list");
  if (!listElement) return;

  listElement.innerHTML = '<div class="muted">Scanning programs.json…</div>';

  const [programEntries, dataDirectories] = await Promise.all([
    loadProgramsFile(),
    invoke("get_data_dirs").catch(() => ({})),
  ]);

  const baseDirectory = dataDirectories?.programs || dataDirectories?.data;

  const foundTools = await findRequiredTools(programEntries);

  const rowsHtml = REQUIRED_TOOLS.map((tool) =>
    generateToolRowHtml(tool, foundTools[tool.key])
  ).join("");

  listElement.innerHTML = rowsHtml || '<div class="muted">No items.</div>';

  // Cache tool statuses for other pages
  try {
    const toolStatuses = await invoke("get_tool_statuses");
    sessionStorage.setItem(
      "tool.statuses.v1",
      JSON.stringify(toolStatuses || [])
    );
  } catch {}

  // Attach event listeners for locate buttons
  listElement.querySelectorAll(".row").forEach((row) => {
    row.addEventListener("click", async (event) => {
      const locateButton = event.target.closest('button[data-action="locate"]');
      if (!locateButton) return;

      const toolKey = row.getAttribute("data-key");
      let defaultPath = baseDirectory;

      try {
        const directories = await invoke("get_data_dirs");
        if (directories?.programs) defaultPath = directories.programs;
      } catch {}

      const selectedPath = await pickExe(defaultPath);
      if (!selectedPath) return;

      // Save the selected program entry
      const toolConfig = REQUIRED_TOOLS.find((tool) => tool.key === toolKey);
      const programEntry = {
        id: crypto.randomUUID(),
        name: toolConfig?.name || toolKey,
        version: "",
        description: "",
        exe_path: selectedPath,
        logo_data_url: "",
      };

      try {
        await invoke("save_program", { program: programEntry });
        await renderRequiredPrograms();
      } catch (error) {
        console.error(error);
        alert(
          typeof error === "string"
            ? error
            : error?.message || "Failed to save path"
        );
      }
    });
  });
}

/**
 * Initializes sidebar pane navigation.
 * @param {HTMLElement} root - The root element of the settings page.
 */
function initializePaneNavigation(root) {
  const navigation = root.querySelector("#settings-nav");

  /**
   * Gets all pane elements.
   * @returns {HTMLElement[]} Array of pane elements.
   */
  function getPanes() {
    return Array.from(root.querySelectorAll("[data-pane]"));
  }

  /**
   * Shows the specified pane and updates navigation buttons.
   * @param {string} paneId - The ID of the pane to show.
   */
  function showPane(paneId) {
    getPanes().forEach((pane) => {
      const isVisible = pane.getAttribute("data-pane") === paneId;
      pane.style.display = isVisible ? "" : "none";
    });

    if (navigation) {
      Array.from(navigation.querySelectorAll("button[data-target]")).forEach(
        (button) => {
          button.classList.toggle(
            "active",
            button.getAttribute("data-target") === paneId
          );
        }
      );
    }
  }

  navigation?.addEventListener("click", (event) => {
    const targetButton = event.target.closest("button[data-target]");
    if (!targetButton) return;
    showPane(targetButton.getAttribute("data-target"));
  });

  showPane("programs");
}

/**
 * Manages technician links functionality.
 * @param {HTMLElement} root - The root element of the settings page.
 */
async function initializeTechnicianLinks(root) {
  const { invoke } = window.__TAURI__.core || {};
  if (!invoke) return;

  let appSettings = {};

  /**
   * Loads app settings from the backend.
   */
  async function loadSettings() {
    try {
      appSettings = await invoke("load_app_settings");
    } catch {
      appSettings = {};
    }
    if (!appSettings.technician_links) appSettings.technician_links = [];
  }

  /**
   * Saves app settings to the backend.
   */
  function saveSettings() {
    return invoke("save_app_settings", { data: appSettings });
  }

  /**
   * Renders the list of technician links in the UI.
   */
  function renderTechnicianLinks() {
    const listElement = root.querySelector("#tech-links-list");
    if (!listElement) return;

    const links = appSettings.technician_links;
    if (!links.length) {
      listElement.innerHTML = '<div class="muted">No links added.</div>';
      return;
    }

    listElement.innerHTML = links
      .map(
        (link) =>
          `<div class="row" data-id="${link.id}">
            <div class="main">
              <div class="name">${escapeHtml(link.title || link.url)}</div>
              <div class="muted" style="font-size:11px;">${escapeHtml(
                link.url
              )}</div>
            </div>
            <div class="meta" style="display:flex;gap:6px;">
              <button data-action="edit" class="ghost" title="Edit" style="min-width:42px;">Edit</button>
              <button data-action="remove" class="danger" title="Remove" style="min-width:42px;">✕</button>
            </div>
          </div>`
      )
      .join("");

    // Attach event listeners for remove buttons
    listElement
      .querySelectorAll('button[data-action="remove"]')
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const linkId = button.closest(".row").getAttribute("data-id");
          appSettings.technician_links = appSettings.technician_links.filter(
            (link) => link.id !== linkId
          );
          saveSettings().then(() => {
            dispatchEvent(new Event("technician-links-updated"));
            renderTechnicianLinks();
          });
        });
      });

    // Setup edit dialog
    const editDialog = root.querySelector("#tech-link-editor");
    const editForm = root.querySelector("#tech-link-edit-form");
    const titleInput = root.querySelector("#t-edit-title");
    const urlInput = root.querySelector("#t-edit-url");
    const cancelButton = root.querySelector("#t-edit-cancel");
    let editingLinkId = null;

    cancelButton?.addEventListener("click", () => editDialog?.close());

    editForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!editingLinkId) return;

      const link = appSettings.technician_links.find(
        (link) => link.id === editingLinkId
      );
      if (!link) return;

      link.title = titleInput.value.trim();
      link.url = urlInput.value.trim();

      await saveSettings();
      editDialog.close();
      dispatchEvent(new Event("technician-links-updated"));
      renderTechnicianLinks();
    });

    // Attach event listeners for edit buttons
    listElement
      .querySelectorAll('button[data-action="edit"]')
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const linkId = button.closest(".row")?.getAttribute("data-id");
          const link = appSettings.technician_links.find(
            (link) => link.id === linkId
          );
          if (!link) return;

          editingLinkId = linkId;
          titleInput.value = link.title || "";
          urlInput.value = link.url || "";
          editDialog.showModal();
          titleInput.focus();
        });
      });
  }

  await loadSettings();
  renderTechnicianLinks();

  // Handle new link form submission
  const addForm = root.querySelector("#tech-link-form");
  addForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(addForm);
    const title = (formData.get("title") || "").toString().trim();
    const url = (formData.get("url") || "").toString().trim();

    if (!title || !url) return;

    appSettings.technician_links.push({
      id: crypto.randomUUID(),
      title,
      url,
    });

    await saveSettings();
    addForm.reset();
    renderTechnicianLinks();
    dispatchEvent(new Event("technician-links-updated"));
  });
}

/**
 * Initializes the settings page functionality.
 * This function sets up the required programs list, pane navigation, and technician links management.
 */
export async function initPage() {
  // Only run on settings page when present
  const root = document.querySelector('[data-page="settings"]');
  if (!root) return;

  // Prevent double-initialization when reloading route
  if (root.dataset.controllerInitialized) return;
  root.dataset.controllerInitialized = "1";

  await renderRequiredPrograms();
  initializePaneNavigation(root);
  await initializeTechnicianLinks(root);
}
