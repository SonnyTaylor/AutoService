/**
 * Service presets landing page controller.
 *
 * Lets users pick a preset (or Custom) and navigates into the run builder.
 * Keyboard accessible: Enter/Space to toggle a card.
 */
export async function initPage() {
  // Check if there's an active run - if so, redirect to runner page
  // BUT only if the user hasn't explicitly dismissed it via back button
  try {
    const { getRunState, isRunActive } = await import(
      "../../utils/task-state.js"
    );
    const state = getRunState();

    // Check if user dismissed this run
    const dismissedRunId = sessionStorage.getItem("taskWidget.dismissedRunId");
    const isDismissed = dismissedRunId && state.runId === dismissedRunId;

    if (!isDismissed && (isRunActive() || state.overallStatus === "running")) {
      console.log("[Presets] Active run detected, redirecting to runner");
      window.location.hash = "#/service-report";
      return;
    } else if (isDismissed) {
      console.log(
        "[Presets] Run was dismissed by user, staying on presets page"
      );
    }
  } catch (e) {
    console.warn("Failed to check run state:", e);
  }

  const cards = Array.from(document.querySelectorAll(".preset-card"));
  const startBtn = document.getElementById("svc-start");
  let selected = null;

  function update() {
    cards.forEach((c) =>
      c.setAttribute(
        "aria-pressed",
        c.dataset.preset === selected ? "true" : "false"
      )
    );
    if (selected) startBtn.removeAttribute("disabled");
    else startBtn.setAttribute("disabled", "");
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      if (selected === card.dataset.preset) {
        selected = null; // toggle off
      } else {
        selected = card.dataset.preset;
      }
      update();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });

  startBtn?.addEventListener("click", () => {
    if (!selected) return;
    const route =
      selected === "custom"
        ? "service-run?mode=custom"
        : `service-run?preset=${selected}`;
    window.location.hash = `#/${route}`;
  });

  update();
}

// (Later) helper to fetch preset definitions from settings JSON
export async function loadPresetDefinitions() {
  try {
    return await window.__TAURI__.core.invoke("load_service_presets");
  } catch {
    return {};
  }
}
