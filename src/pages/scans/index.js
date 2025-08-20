export async function initPage() {
  const startBtn = document.getElementById("scan-start");
  const rows = Array.from(document.querySelectorAll('.scan-row'));
  const radios = Array.from(document.querySelectorAll('input[name="serviceType"]'));

  // Dynamically size the scan options to fit the viewport without showing a page scrollbar
  const pageEl = document.querySelector('[data-page="scans"]');
  const optionsEl = pageEl?.querySelector('.scan-options');
  const pageContainerEl = pageEl?.closest('.page-container');

  function sizeOptionsToViewport() {
    if (!optionsEl) return;
    // Measure distance from top of viewport to the options, subtract bottom padding of the page box
    const rect = optionsEl.getBoundingClientRect();
    const pageStyles = pageEl ? getComputedStyle(pageEl) : null;
  const pagePadBottom = pageStyles ? parseFloat(pageStyles.paddingBottom) || 0 : 0;
  const containerPadBottom = pageContainerEl ? parseFloat(getComputedStyle(pageContainerEl).paddingBottom) || 0 : 0;
    // Subtract 1px to avoid accidental overflow from subpixel rounding
  const h = Math.max(0, Math.floor(window.innerHeight - rect.top - pagePadBottom - containerPadBottom - 1));
    optionsEl.style.height = `${h}px`;
  }

  sizeOptionsToViewport();
  // Use rAF to ensure layout settled (fonts, etc.) then recompute
  requestAnimationFrame(sizeOptionsToViewport);
  window.addEventListener('resize', sizeOptionsToViewport, { passive: true });

  function updateStartState() {
    const selected = radios.find(r => r.checked);
    startBtn.disabled = !selected;
  }

  // Allow clicking anywhere on row to select
  rows.forEach((row) => {
    row.addEventListener('click', (e) => {
      const input = row.querySelector('input[type="radio"]');
      if (!input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  radios.forEach(r => r.addEventListener('change', updateStartState));
  updateStartState();

  startBtn?.addEventListener('click', () => {
    const chosen = radios.find(r => r.checked)?.value || '';
    // Navigate to the next page with the chosen preset encoded in the hash query
    const q = encodeURIComponent(chosen);
    window.location.hash = `#/service?preset=${q}`;
  });
}
