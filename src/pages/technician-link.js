export async function showTechnicianLink(id){
  let settings = {};
  try { settings = await window.__TAURI__.core.invoke('load_app_settings'); } catch {}
  const link = (settings.technician_links || []).find(l => `tech-${l.id}` === `tech-${id}` || l.id === id);
  const frame = document.getElementById('tech-link-frame');
  // Title/header removed for full-bleed view
  if (!frame) return;
  if (!link){
    frame.srcdoc = '<div style="padding:1rem;font:14px sans-serif;color:#888;">Link not found. Return to Settings to configure technician links.</div>';
    return;
  }
  // Basic sanitization: ensure protocol present
  let url = link.url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  frame.src = url;
}
