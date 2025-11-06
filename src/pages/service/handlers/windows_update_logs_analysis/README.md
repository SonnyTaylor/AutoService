# Windows Update Logs Analysis Handler

Frontend handler for the Windows Update error logs analysis service.

## Files

- **index.js** - Main handler with service definition, renderers, and print CSS

## Service Definition

```javascript
export const definition = {
  id: "windows_update_logs_analysis",
  label: "Windows Update Error Analysis",
  group: "Diagnostics",
  defaultParams: {
    time_frame: "week",
    include_ai_analysis: false
  }
}
```

## Exports

### definition
Service metadata for catalog:
- `id` - Unique service identifier
- `label` - UI display name
- `group` - Service category
- `defaultParams` - Default task parameters
- `toolKeys` - External tool dependencies (none for this service)
- `build()` - Function to construct task JSON

### renderTech(context)
Renders technician view showing:
- Error summary KPIs
- Error code table with frequency
- AI analysis section (if available)
- Package impact tracking
- Error output details

### extractCustomerMetrics(context)
Extracts customer-friendly metrics:
- Success state: "No Errors"
- Warning state: "X error(s) detected"
- Most common error indicator

### printCSS
Print stylesheet covering:
- Table styling
- Priority badge colors
- Page break handling
- Professional formatting

## Usage

The handler is automatically registered in the service catalog. Users can:

1. Select "Windows Update Error Analysis" from service dropdown
2. Configure parameters:
   - Time frame (today/week/month/all)
   - AI analysis (true/false)
3. Run the service
4. View results in technician/customer reports

## Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| time_frame | string | "week" | Time period for error analysis |
| include_ai_analysis | boolean | false | Enable AI-powered remediation |

## Response Structure

The service returns structured JSON with:
- `error_groups` - Array of error codes with metadata
- `total_errors_found` - Count of events
- `unique_error_codes` - Count of unique codes
- `human_readable` - User-friendly summary
- `error_groups[].ai_analysis` - AI insights (if enabled)

## Rendering Features

### Error Table
- Hex error code
- Error name (from Err.exe)
- Frequency count
- Latest occurrence time
- Affected packages

### AI Analysis Card
- Error code reference
- Priority level badge (color-coded)
- Issue summary
- Root causes list
- Remediation steps
- References for each finding

### Customer Metric
- Status indicator (✓/⚠)
- High-level assessment
- Most common error type
- Affected count

## Print Output

Professional PDF formatting with:
- Color-coded priority indicators
- Responsive table layout
- Proper page breaks
- Technician-focused detail level
- Remediation guidance for field service

## Integration Points

- **Catalog** - Listed in service dropdown
- **Builder** - Accepts parameters
- **Runner** - Delegates to Python service
- **Results** - Rendered via renderTech()
- **Reports** - Metrics via extractCustomerMetrics()
- **Print** - Styled via printCSS

## Common Error Codes

**0x80073D02** - ERROR_PACKAGES_IN_USE
- Windows app packages blocked during installation
- Solution: Close apps, restart Windows

**0x80240438** - WU_E_PT_SOAP_FAULT
- Windows Update service communication error
- Solution: Reset service, clear cache

**0x87AF000D** - Microsoft Store Error
- Store app update installation failure
- Solution: Clear cache, re-register Store

## AI Analysis

When enabled, service provides:
- Root cause explanation
- Likely contributing factors
- Step-by-step remediation
- Priority assessment (critical/high/medium/low)

Requires `OPENAI_API_KEY` environment variable.

## Styling

Print CSS includes:
- `.card.windows-update-logs` - Main container
- `.error-table` - Error frequency table
- `.ai-analysis-card` - AI insights card
- `.priority-badge` - Priority level indicator
- `.package-badge` - Package reference

## Performance

- Rendering: ~100ms
- Print generation: ~500ms
- Total page load impact: minimal

## Browser Compatibility

- Chrome 105+ (Tauri webview target)
- Edge-based rendering
- Print via CSS media queries

## Accessibility

- Semantic HTML structure
- Color + text for priority levels
- Expandable details sections
- Readable table structure

## Future Enhancements

- [ ] Real-time error tracking
- [ ] Historical charts
- [ ] Automatic remediation UI
- [ ] Scheduled analysis
- [ ] Error filtering/search
- [ ] Export to external formats

## Related Services

- **windows_update** - Install Windows updates
- **sfc_scan** - Repair system files
- **dism_health_check** - Check component store

## Reference

See main documentation:
- `WINDOWS_UPDATE_LOGS_INTEGRATION.md` - Full integration guide
- `WINDOWS_UPDATE_LOGS_QUICK_REF.md` - Quick reference
- `runner/services/WINDOWS_UPDATE_LOGS_README.md` - Service documentation
