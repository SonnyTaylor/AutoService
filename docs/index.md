# AutoService Documentation

Welcome to the AutoService documentation! Your complete guide to using and developing AutoService—a powerful Windows diagnostic toolkit built with **Tauri (Rust)** + **vanilla JavaScript**.

<div class="grid cards" markdown>

- :material-tools:{ .lg .middle } **Portable Toolkit**

    ---

    Run from USB drives. No installation. Bring your tools anywhere.

- :material-lightning-bolt:{ .lg .middle } **Automated Workflows**

    ---

    Queue maintenance tasks and run them with one click. Save time on repetitive diagnostics.

- :material-chart-line:{ .lg .middle } **Comprehensive Reports**

    ---

    Generate technical and customer-friendly reports automatically after each run.

- :material-puzzle:{ .lg .middle } **Extensible Design**

    ---

    Add custom programs and scripts without touching code. Tailored to your workflow.

</div>

## :fontawesome-solid-rocket: Key Features

<div class="grid" markdown>

<div markdown>

### :material-robot: Automation First

Orchestrate cleanup, diagnostics, and stress testing with tools like **AdwCleaner**, **BleachBit**, **SFC**, **DISM**, **smartctl**, **HeavyLoad**, and **FurMark**—all queued in a single workflow.

</div>

<div markdown>

### :material-view-sequential: Run Queue Builder

Drag-and-drop interface to build ordered task sequences. Configure parameters. Execute with precision.

</div>

<div markdown>

### :material-briefcase: Portable & Extensible

Designed for USB deployment. Add your own tools and scripts via simple folder drops—no code changes required.

</div>

<div markdown>

### :material-monitor-dashboard: System Diagnostics

Collect comprehensive hardware specs, OS info, GPU details, battery health, and storage metrics—all in one view.

</div>

<div markdown>

### :material-test-tube: Component Testing

Validate cameras, microphones, speakers, displays, keyboard, mouse, and network—ensuring hardware works as expected.

</div>

<div markdown>

### :material-file-document: Detailed Reports

Two report types: **Technical** (full diagnostic data) and **Customer** (simplified summaries). Export as PDF, JSON, or HTML.

</div>

</div>

!!! abstract "Portable Design"
    AutoService runs from USB drives alongside a `data/` folder. Keep the executable and data directory together for full functionality:

    ```
    📂 USB Drive
    ├── AutoService.exe
    └── data/
        ├── programs/      # External tools
        ├── settings/      # Configuration
        ├── reports/       # Generated reports
        └── logs/          # Execution logs
    ```

!!! warning "System Requirements"
    - **OS**: Windows 10 or later
    - **Privileges**: Administrator access for diagnostic tasks
    - **Space**: 100 MB minimum for app + logs

## :fontawesome-solid-map: Quick Navigation

<div class="grid cards" markdown>

- :material-account:{ .lg .middle } **For Users**

    ---

    Using AutoService to maintain or diagnose systems?

    [:octicons-arrow-right-24: User Guide Overview](user-guide/overview.md)  
    [:octicons-arrow-right-24: Getting Started](user-guide/getting-started.md)  
    [:octicons-arrow-right-24: Service Tab](user-guide/service-tab.md)  
    [:octicons-arrow-right-24: Programs Tab](user-guide/programs-tab.md)  
    [:octicons-arrow-right-24: System Info Tab](user-guide/system-info-tab.md)  
    [:octicons-arrow-right-24: Settings Tab](user-guide/settings-tab.md)

- :material-code-braces:{ .lg .middle } **For Developers**

    ---

    Contributing to AutoService development?

    [:octicons-arrow-right-24: Developer Overview](developer-guide/overview.md)  
    [:octicons-arrow-right-24: Development Setup](developer-guide/dev-setup.md)  
    [:octicons-arrow-right-24: Adding a Service](developer-guide/adding-service.md)  
    [:octicons-arrow-right-24: Architecture](developer-guide/architecture.md)  
    [:octicons-arrow-right-24: Frontend Development](developer-guide/frontend-dev.md)  
    [:octicons-arrow-right-24: Backend Development](developer-guide/backend-dev.md)

</div>

## :fontawesome-solid-handshake: Support & Contributing

<div class="grid cards" markdown>

- :material-bug:{ .lg .middle } **Report Issues**

    ---

    Found a bug? Have a feature request?

    [:octicons-arrow-right-24: GitHub Issues](https://github.com/SonnyTaylor/AutoService/issues)

- :material-scale-balance:{ .lg .middle } **License**

    ---

    GNU General Public License v3.0

    [:octicons-arrow-right-24: View License](https://github.com/SonnyTaylor/AutoService/blob/main/LICENSE)

- :material-help-circle:{ .lg .middle } **Get Help**

    ---

    Need assistance? Check existing issues first.

    [:octicons-arrow-right-24: Ask Questions](https://github.com/SonnyTaylor/AutoService/discussions)

- :material-git:{ .lg .middle } **Contribute**

    ---

    Want to contribute? Start here.

    [:octicons-arrow-right-24: Contributing Guide](developer-guide/contributing.md)

</div>

---

<div align="center" markdown>

**Version 0.4.0** • Last Updated: October 2025

[:fontawesome-brands-github: View on GitHub](https://github.com/SonnyTaylor/AutoService){ .md-button .md-button--primary }

</div>
