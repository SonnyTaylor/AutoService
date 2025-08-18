function getHashQuery() {
  const hash = window.location.hash || '';
  const idx = hash.indexOf('?');
  if (idx === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(idx + 1));
}

export async function initPage() {
  const params = getHashQuery();
  const preset = params.get('preset') || 'general';
  const readout = document.getElementById('preset-readout');
  const sub = document.getElementById('service-sub');

  const label = (
    preset === 'complete-general' ? 'Complete General Service' :
    preset === 'custom' ? 'Custom Service' :
    'General Service'
  );

  if (readout) readout.textContent = label;
  if (sub) {
    if (preset === 'custom') {
      sub.textContent = 'Select the exact items you want to run.';
    } else if (preset === 'complete-general') {
      sub.textContent = 'Full preset is preselected. You can review items below.';
    } else {
      sub.textContent = 'Quick preset is preselected. You can review items below.';
    }
  }
}
