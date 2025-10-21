# [Service Name] Handler

## Overview

[Brief description of what this service does and why it exists]

## Service Definition

- **ID**: `template_service`
- **Label**: Template Service
- **Group**: Diagnostics
- **Category**: Diagnostics

## Parameters

| Parameter     | Type   | Default   | Description                   |
| ------------- | ------ | --------- | ----------------------------- |
| example_param | string | "default" | Example parameter description |

## Tool Dependencies

- **tool_key**: [Tool name and version] - [Purpose]

## Python Handler

This service is handled by `runner/services/template_service.py` with the function `run_template_service(task)`.

### Expected Task Payload

```json
{
  "type": "template_service",
  "param1": "value1",
  "ui_label": "Template Service"
}
```

### Expected Result Structure

```json
{
  "status": "success",
  "summary": {
    "human_readable": {
      "example_value": "...",
      "verdict": "..."
    },
    "results": {
      "raw_data": "..."
    }
  }
}
```

## Rendering

### Technician View

The technician view shows:

- [Key metric 1]
- [Key metric 2]
- [Additional details]

### Customer Metrics

Customer reports include:

- **[Metric Name]**: [Description of what customer sees]

## Testing

Test fixtures are available in `fixtures/` directory:

- `test_success.json` - Successful execution
- `test_error.json` - Error case

## Notes

[Any special considerations, edge cases, or business logic notes]

## CSS Exports

Handlers follow a standardized CSS export naming convention:

- `viewCSS` – Technician web view (screen) styles for this handler
- `printCSS` – Technician print styles (tech PDF)
- `customerPrintCSS` – Customer print styles (customer PDF)

Guidelines:

- Scope all selectors to this handler (e.g., `.card.template-service` or `.template-service`).
- Keep CSS minimal and service-specific—avoid duplicating base styles.
- If no special styling is needed, you can export empty strings.

Example:

```js
export const viewCSS = `
  .card.template-service { }
`;

export const printCSS = `
  .template-service .grid { display: grid; gap: 8px; }
`;

export const customerPrintCSS = `
  .template-service .note { border: 1px solid #cbd5e1; padding: 6px; }
`;
```

## Migration Checklist

- [ ] CSS exports added (viewCSS at minimum; printCSS/customerPrintCSS as needed)
