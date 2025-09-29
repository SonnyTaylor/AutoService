import { html } from "lit-html";
import { map } from "lit-html/directives/map.js";

export const renderHeader = (label, status) => html`
  <div class="result-header">
    <h3>${label || "Task"}</h3>
    <span class="status ${String(status || "").toLowerCase()}"
      >${status || "unknown"}</span
    >
  </div>
`;

export const renderList = (obj) => html`
  <dl class="kv">
    ${map(
      Object.entries(obj || {}),
      ([k, v]) => html`
        <dt>${prettifyKey(k)}</dt>
        <dd>${formatValue(v)}</dd>
      `
    )}
  </dl>
`;

export function prettifyKey(k) {
  return String(k)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function formatValue(v) {
  if (v == null) return "-";
  if (Array.isArray(v)) {
    if (v.length === 0) return "-";
    if (typeof v[0] === "string" || typeof v[0] === "number")
      return v.join(", ");
    return `${v.length} item(s)`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const kpiBox = (label, value, variant) => html`
  <div class="kpi${variant ? " " + variant : ""}">
    <span class="lab">${label}</span>
    <span class="val">${value == null ? "-" : String(value)}</span>
  </div>
`;

export const pill = (text, variant) => html`
  <span class="pill${variant ? " " + variant : ""}">${text}</span>
`;

export function fmtMs(ms) {
  if (ms == null || !isFinite(ms)) return "-";
  return `${Math.round(ms)} ms`;
}

export function fmtMbps(n) {
  if (n == null || !isFinite(n)) return "-";
  return `${Math.round(n * 10) / 10} Mbps`;
}
