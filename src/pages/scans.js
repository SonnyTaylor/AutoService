export async function initPage() {
  const startBtn = document.getElementById("scan-start");
  const rows = Array.from(document.querySelectorAll('.scan-row'));
  const radios = Array.from(document.querySelectorAll('input[name="serviceType"]'));

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
