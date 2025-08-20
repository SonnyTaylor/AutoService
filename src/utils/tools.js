// Shared tool availability utilities for all pages
const { invoke } = window.__TAURI__.core;

const CACHE_KEY = 'tool.statuses.v1';

export async function getToolStatuses(force = false) {
  if (!force) {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  try {
    const statuses = await invoke('get_tool_statuses');
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(statuses || [])); } catch {}
    return statuses || [];
  } catch {
    return [];
  }
}

export async function isToolAvailable(key, force = false) {
  const list = await getToolStatuses(force);
  const hit = list.find(t => t.key === key);
  return !!(hit && hit.exists);
}

export async function getToolPath(key, force = false) {
  const list = await getToolStatuses(force);
  const hit = list.find(t => t.key === key);
  return hit?.path || null;
}
