# Reports Tab

The **Reports** tab shows previously generated reports from completed maintenance and diagnostic runs.

## Overview

Reports contain:

- **Execution results** from all tasks run
- **Technical data** for diagnostic purposes
- **Customer summaries** for client handoff
- **Timestamps** and duration information
- **Status** of each task (success, warning, failed)

## Viewing Reports

1. Click the **Reports** tab
2. A list of previous reports is displayed with:
   - Run date and time
   - Number of tasks executed
   - Overall status
3. Click on a report to view details

## Report Contents

### Technical Report

Contains detailed technical information:

- **Raw output** from each tool
- **Performance metrics** and benchmarks
- **Full error messages** if any
- **Execution logs** and timestamps
- **Configuration** used for the run

**Best for:**

- Detailed diagnostics and troubleshooting
- Technical record-keeping
- Analyzing tool output
- Archival purposes

### Customer Report

Contains a simplified professional summary:

- **Executive summary** of findings
- **Issues found** and recommendations
- **Work performed** (files cleaned, space freed)
- **Security status** and threats
- **Performance results** from testing
- **Next steps** or recommendations

**Best for:**

- Client communication
- Service documentation
- Quick reference
- Professional appearance

## Exporting Reports

### How to Export

1. Open a report
2. Click the **"Export"** or **"Download"** button
3. Choose your desired format

## Organizing Reports

Reports are stored in `data/reports/` with timestamps:

```text
data/reports/
├── run_1760227693411.json
├── run_1760238913549.json
└── run_1760251147645.json
```

### Archiving Old Reports

1. Move old report files to an archive location
2. Keep recent reports in `data/reports/` for quick access
3. Consider compressing archived reports to save space

## Tips for Report Management

- **Save important reports**: Export to PDF or JSON for long-term storage
- **Compare reports**: Run the same tasks periodically to track improvements
- **Customer copies**: Always give clients a PDF or email summary
- **Technical records**: Keep JSON exports for internal records
- **Folder organization**: Create subfolders in `data/reports/` by date or client

## Report Best Practices

- **Date your reports**: Timestamp helps track changes over time
- **Include baseline**: Take an initial report before maintenance
- **After-action report**: Take another report after major work
- **Document changes**: Note what was fixed and when
- **Archive systematically**: Keep organized storage of historical reports

---

Next: [Component Tests Tab](component-tests.md)
