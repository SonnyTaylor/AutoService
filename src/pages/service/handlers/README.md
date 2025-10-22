# Service Handlers

This directory contains the new unified handler system for AutoService service tasks.

## What is a Handler?

A **handler** is a self-contained module that defines everything about a service task:

- Service catalog definition (ID, label, parameters, build function)
- Technician view renderer (detailed technical results)
- Customer metrics extractor (customer-friendly summary)
- Documentation, test fixtures, and business logic

## Why Handlers?

The old architecture scattered service logic across multiple files:

- Service definition in `catalog.js`
- Tech renderer in `renderers/tasks.js`
- Customer metrics in `print/metrics.js` (1000+ lines)

This made it hard to:

- Find all code related to a service
- Add new services (had to edit 3+ files)
- Test services in isolation
- Understand what a service does

The handler system solves this by **co-locating all service-specific logic** in one place.

## Directory Structure

```text
handlers/
# Service Handlers

This directory contains the unified handler system for AutoService service tasks.

## What is a Handler?

A handler is a self-contained module that defines everything about a service task:

- Service catalog definition (ID, label, parameters, build function)
- Technician view renderer (detailed technical results)
- Customer metrics extractor (customer-friendly summary)
- Documentation, test fixtures, and business logic

## Why Handlers?

Previously, service logic was scattered across multiple files (catalog, tech renderers, customer metrics), making changes hard. Handlers co-locate all service-specific logic in one place.

## Directory Structure

```

handlers/
├── index.js              # Handler registry (imports and exports all handlers)
├── types.js              # Type definitions for handlers
├── common/               # Shared utilities
│   ├── ui.js             # UI rendering helpers
│   └── metrics.js        # Customer metric helpers
├── _TEMPLATE/            # Template for creating new handlers
│   ├── index.js          # Complete handler template
│   ├── README.md         # Documentation template
│   └── fixtures/         # Test fixture template
└── [service_id]/         # Individual service handlers
    ├── index.js          # Handler implementation
    ├── README.md         # Service-specific documentation
    └── fixtures/         # Test data
        ├── test_success.json
        ├── test_error.json
        └── ...

```

## Handler Structure

Each handler exports these components:

### 1. Service Definition

```javascript
export const definition = {
  id: "speedtest",
  label: "Internet Speed Test",
  group: "Network",
  toolKeys: [],
  async build({ params, resolveToolPath, getDataDirs }) {
    return { type: "speedtest", ui_label: "Internet Speed Test" };
  },
};
```

### 2. Technician Renderer

```javascript
export function renderTech({ result, index }) {
  return html`
    <div class="card speedtest">
      ${renderHeader(result.ui_label, result.status)}
      <!-- Detailed technical view -->
    </div>
  `;
}
```

### 3. Customer Metrics Extractor (Optional)

```javascript
export function extractCustomerMetrics({ summary, status }) {
  if (status !== "success") return null;
  return buildMetric({
    icon: "🌐",
    label: "Internet Speed",
    value: "150 Mbps",
    variant: "success",
  });
}
```

### 4. CSS Exports (Optional, Standardized)

Handlers use standardized CSS exports:

- `viewCSS` – Technician web view (screen) styles
- `printCSS` – Technician print styles (tech PDF)
- `customerPrintCSS` – Customer print styles (customer PDF)

Examples:

```javascript
export const viewCSS = `
  .card.speedtest { /* screen tweaks */ }
`;

export const printCSS = `
  /* Technician print styles */
  .speedtest-kpis { display: grid; grid-template-columns: repeat(2, 1fr); }
  .speedtest-chart { display: none !important; }
`;

export const customerPrintCSS = `
  /* Customer print styles */
  .speedtest-summary { border: 1px solid #cbd5e1; padding: 8px; }
`;
```

## Creating a New Handler

### Option 1: During Migration (Recommended)

See `docs/HANDLER_MIGRATION_GUIDE.md`.

### Option 2: New Service from Scratch

1. Copy the template:

```bash
cp -r handlers/_TEMPLATE handlers/my_service
```

1. Edit `handlers/my_service/index.js`:

- Update the service definition
- Implement the tech renderer
- Implement the customer metrics extractor (optional)
- Add CSS exports (viewCSS at minimum)

1. Register the handler in `handlers/index.js`:

```javascript
import * as myService from "./my_service/index.js";

const HANDLERS = {
  my_service: myService,
};
```

1. Document in `handlers/my_service/README.md`:

- Service overview
- Parameters
- Python handler contract
- Rendering details
- Testing instructions

1. Create test fixtures in `handlers/my_service/fixtures/`:

- `test_success.json` - Successful execution
- `test_error.json` - Error case
- Additional edge cases as needed

## Common Utilities

Handlers have access to shared utilities.

### UI Utilities (`common/ui.js`)

- `renderHeader(label, status)` - Standard header with status badge
- `kpiBox(label, value, variant)` - KPI display box
- `pill(text, variant)` - Status pill
- `renderList(obj)` - Key-value list
- `prettifyKey(key)` - Format snake_case → Title Case
- `formatValue(value)` - Format various value types

### Metric Utilities (`common/metrics.js`)

- `formatBytes(bytes, decimals)` - Format bytes → "1.5 GB"
- `formatPercent(value, decimals)` - Format percent → "85.5%"
- `formatDuration(ms)` - Format milliseconds → "1.5s"
- `getStatusVariant(status)` - Convert status → 'success' | 'info' | 'warning'
- `buildMetric({...})` - Build CustomerMetric object
- `truncateItems(items, limit)` - Truncate array with ellipsis

## Handler Registry API

The registry (`index.js`) provides these functions:

- `getHandlers()` - Get all registered handlers
- `getHandler(id)` - Get specific handler by ID
- `getServiceDefinitions()` - Get all service catalog definitions
- `getTechRenderers()` - Get all tech renderer functions
- `getCustomerMetricExtractors()` - Get all customer metric extractors
- `getHandlerViewCSS()` - Get concatenated screen CSS (`viewCSS`) from all handlers
- `getHandlerPrintCSS()` - Get concatenated technician print CSS (`printCSS`) from handlers
- `getHandlerCustomerPrintCSS()` - Get concatenated customer print CSS (`customerPrintCSS`) from handlers
- `hasHandler(id)` - Check if handler is registered
- `listHandlerIds()` - Get list of all handler IDs

## Print CSS System

Handlers can export service-specific print CSS for technician reports, and customer print CSS for customer PDFs.

### Why Use Print CSS?

Use print CSS when:

- Your service has custom layouts (grids, flexbox)
- Charts/visualizations need hiding in print
- Service-specific components need print styling

### How It Works

```javascript
// 1) Export CSS in your handler using standardized names
export const viewCSS = ` .my-service { } `;
export const printCSS = ` .my-service { } `; // Technician print
export const customerPrintCSS = ` .my-service { } `; // Customer print

// 2) Injection (implemented)
// - Technician web view: viewCSS is injected on the results page automatically.
// - Technician print: printCSS is bundled into the print document via getTechPrintCSS().
// - Customer print: customerPrintCSS is bundled into the customer print document.
```

### Best Practices

Do:

- Scope CSS with service class: `.my-service .custom { }`
- Focus on print-specific needs (layout, hiding charts)
- Keep it minimal

Don't:

- Use global selectors (affects all services)
- Duplicate base styles (cards, KPIs already styled)
- Include screen-only styles in print CSS

### Examples

Technician print:

```javascript
export const printCSS = `
  /* Detection grid layout */
  .kvrt-detection-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  /* Detection card styling */
  .kvrt-detection { background: #fafbfc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; page-break-inside: avoid; }
  /* Hide interactive elements in print */
  .kvrt-chart { display: none !important; }
`;
```

Customer print:

```javascript
export const customerPrintCSS = `
  .kvrt-summary { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; }
`;
```

## Handler Review Checklist (CSS)

- [ ] Exports `viewCSS` (at minimum)
- [ ] Exports `printCSS` if technician print needs service-specific styles
- [ ] Exports `customerPrintCSS` if customer print needs service-specific styles
- [ ] All selectors scoped to handler (e.g., `.card.my-service`)
- [ ] No duplication of base styles

## Integration

Handlers automatically integrate with:

1. Catalog (`src/pages/service/catalog.js`) – Service definitions
2. Renderers (`src/pages/service/results/renderers/tasks.js`) – Tech renderers
3. Metrics (`src/pages/service/results/print/metrics.js`) – Customer metrics

## Testing

### Unit Tests

```javascript
import { extractCustomerMetrics } from "./handlers/speedtest/index.js";
import testData from "./handlers/speedtest/fixtures/test_success.json";

const metrics = extractCustomerMetrics({
  summary: testData.summary,
  status: testData.status,
});

console.assert(metrics != null, "Should extract metrics");
console.assert(metrics.icon === "🌐", "Should have correct icon");
```

### Integration Tests

Test through the full workflow:

1. Builder UI – Service appears and is configurable
2. Runner – Task executes and streams logs
3. Results – Tech view renders correctly
4. Print Tech – Technician PDF generates
5. Print Customer – Customer summary generates

## Documentation

- Full Migration Guide: `docs/HANDLER_MIGRATION_GUIDE.md`
- Quick Reference: `docs/HANDLER_QUICK_REFERENCE.md`
- Infrastructure Summary: `docs/HANDLER_INFRASTRUCTURE_SUMMARY.md`
- Migration Progress: `docs/HANDLER_MIGRATION_PROGRESS.md`

## Migration Status

Current status: Phase 2 (CSS injection) implemented.

Phase 3 progress (service-specific `viewCSS` migrated from `service.css`):

- ping_test (card.ping)
- speedtest (card.speedtest)
- smartctl_report (drive list/card styles)
- disk_space_report (card.disk-space)
- battery_health_report (card.battery-health)
- windows_update (card.windows-update)
- winsat_disk (card.winsat, incl. responsive media query)
- kvrt_scan (card.kvrt)
- adwcleaner_clean (card.adwcleaner numeric KPI tweak)
- iperf_test (card.iperf chart spacing)
- ai_startup_disable (card.ai-startup-optimizer)
- ai_browser_notification_disable (card.ai-browser-notification-optimizer)
- drivecleanup_clean (card.drivecleanup removed-items grid)
- whynotwin11_check (card.wn11)

## Service Categories

- Diagnostics: System health checks (battery, SMART, disk space, WinSAT)
- Security: Antivirus and malware removal (KVRT, AdwCleaner)
- Cleanup: Maintenance tasks (BleachBit, disk cleanup)
- Network: Connectivity tests (speedtest, ping, iPerf)
- Stress: Hardware stress testing (FurMark, HeavyLoad)
- System Integrity: Windows health (SFC, DISM, Windows Update)

## Contributing

When creating or migrating a handler:

1. Follow the template structure
2. Use common utilities (DRY)
3. Document thoroughly in README.md
4. Create test fixtures
5. Test all three views (builder, tech, customer)
6. Update migration progress tracker
7. Commit with a clear message

---

Let's make AutoService more maintainable, one handler at a time! 🚀
