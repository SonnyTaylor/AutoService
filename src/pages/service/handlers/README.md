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
└── [service_id]/         # Individual service handlers (created during migration)
    ├── index.js          # Handler implementation
    ├── README.md         # Service-specific documentation
    └── fixtures/         # Test data
        ├── test_success.json
        ├── test_error.json
        └── ...
```

## Handler Structure

Each handler exports three main components:

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

## Creating a New Handler

### Option 1: During Migration (Recommended)

Follow the comprehensive guide: `docs/HANDLER_MIGRATION_GUIDE.md`

### Option 2: New Service from Scratch

1. **Copy the template**:

   ```bash
   cp -r handlers/_TEMPLATE handlers/my_service
   ```

2. **Edit `handlers/my_service/index.js`**:

   - Update the service definition
   - Implement the tech renderer
   - Implement the customer metrics extractor (optional)

3. **Register the handler in `handlers/index.js`**:

   ```javascript
   import * as myService from "./my_service/index.js";

   const HANDLERS = {
     my_service: myService,
   };
   ```

4. **Document in `handlers/my_service/README.md`**:

   - Service overview
   - Parameters
   - Python handler contract
   - Rendering details
   - Testing instructions

5. **Create test fixtures in `handlers/my_service/fixtures/`**:
   - `test_success.json` - Successful execution
   - `test_error.json` - Error case
   - Additional edge cases as needed

## Common Utilities

Handlers have access to shared utilities:

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
- `hasHandler(id)` - Check if handler is registered
- `listHandlerIds()` - Get list of all handler IDs

## Integration

Handlers automatically integrate with:

1. **Catalog** (`src/pages/service/catalog.js`) - Service definitions merge into SERVICES object
2. **Renderers** (`src/pages/service/results/renderers/tasks.js`) - Tech renderers merge into RENDERERS object
3. **Metrics** (`src/pages/service/results/print/metrics.js`) - Extractors called before legacy processing

See integration points in those files (marked with "HANDLER INTEGRATION" comments).

## Testing

### Unit Tests

Test handlers in isolation using fixtures:

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

1. Builder UI - Service appears and is configurable
2. Runner - Task executes and streams logs
3. Results - Tech view renders correctly
4. Print Tech - Technician PDF generates
5. Print Customer - Customer summary generates

## Documentation

- **Full Migration Guide**: `docs/HANDLER_MIGRATION_GUIDE.md` (1000+ lines)
- **Quick Reference**: `docs/HANDLER_QUICK_REFERENCE.md` (cheat sheet)
- **Infrastructure Summary**: `docs/HANDLER_INFRASTRUCTURE_SUMMARY.md`
- **Migration Progress**: `docs/HANDLER_MIGRATION_PROGRESS.md` (tracker)

## Migration Status

**Current Status**: Infrastructure ready, handlers to be migrated

See `docs/HANDLER_MIGRATION_PROGRESS.md` for detailed tracking.

**Total Services**: 17  
**Migrated**: 0  
**Remaining**: 17

## Service Categories

Handlers are organized by category in the UI:

- **Diagnostics**: System health checks (battery, SMART, disk space, WinSAT)
- **Security**: Antivirus and malware removal (KVRT, AdwCleaner)
- **Cleanup**: Maintenance tasks (BleachBit, disk cleanup)
- **Network**: Connectivity tests (speedtest, ping, iPerf)
- **Stress**: Hardware stress testing (FurMark, HeavyLoad)
- **System Integrity**: Windows health (SFC, DISM, Windows Update)

## Contributing

When creating or migrating a handler:

1. ✅ Follow the template structure
2. ✅ Use common utilities (DRY)
3. ✅ Document thoroughly in README.md
4. ✅ Create test fixtures
5. ✅ Test all three views (builder, tech, customer)
6. ✅ Update migration progress tracker
7. ✅ Commit with clear message

## Questions?

Refer to the documentation:

- New to handlers? Start with `docs/HANDLER_MIGRATION_GUIDE.md`
- Need quick lookup? Use `docs/HANDLER_QUICK_REFERENCE.md`
- Creating new service? Use `_TEMPLATE/` as starting point
- Stuck? Check existing migrated handlers as examples

---

**Let's make AutoService more maintainable, one handler at a time!** 🚀
