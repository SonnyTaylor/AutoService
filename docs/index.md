# AutoService Documentation

Welcome to the AutoService documentation! This is your complete guide to using and developing AutoService, a Windows diagnostic toolkit built with Tauri (Rust backend) + vanilla JavaScript frontend.

## What is AutoService?

AutoService is a portable, USB-friendly Windows diagnostic and maintenance toolkit designed for computer repair technicians and power users. It automates cleanup tasks, runs diagnostics, executes stress tests, and generates comprehensive reports—all from a single executable.

### Key Features

- **Automation First**: Orchestrate tools like AdwCleaner, BleachBit, SFC, DISM, smartctl, HeavyLoad, and FurMark with minimal clicks
- **Run Queue Builder**: Build an ordered list of maintenance tasks directly from the UI
- **Portable & Extensible**: Add your own programs and scripts without code changes
- **System Diagnostics**: Comprehensive hardware and OS information collection
- **Component Testing**: Test cameras, microphones, speakers, displays, and network connectivity
- **Detailed Reports**: Generate technical and customer-friendly reports

!!! info "Portable Design"
AutoService is designed to run from USB drives alongside a `data/` folder. Keep the executable and data folder together for full functionality.

!!! warning "System Requirements"
AutoService requires Windows 10 or later and administrator privileges for most diagnostic tasks.

## Quick Navigation

### For Users

If you're using AutoService to maintain or diagnose systems:

- **[User Guide Overview](user-guide/overview.md)** - Understand what AutoService can do
- **[Getting Started](user-guide/getting-started.md)** - First-time setup and basic usage
- **[Service Tab](user-guide/service-tab.md)** - Run automation tasks and cleanup tools
- **[Programs Tab](user-guide/programs-tab.md)** - Manage and launch portable tools
- **[System Info Tab](user-guide/system-info-tab.md)** - View detailed hardware and OS information
- **[Settings Tab](user-guide/settings-tab.md)** - Configure AutoService behavior

### For Developers

If you're contributing to AutoService development:

- **[Developer Overview](developer-guide/overview.md)** - Architecture and key concepts
- **[Development Setup](developer-guide/dev-setup.md)** - Set up your development environment
- **[Adding a Service](developer-guide/adding-service.md)** - Create a new diagnostic or maintenance service
- **[Architecture](developer-guide/architecture.md)** - Deep dive into the three-layer design
- **[Frontend Development](developer-guide/frontend-dev.md)** - Vanilla JS + Vite patterns
- **[Backend Development](developer-guide/backend-dev.md)** - Tauri commands and Rust patterns

## Support & Contributing

- **Issues**: Report bugs or request features on [GitHub](https://github.com/SonnyTaylor/AutoService/issues)
- **License**: GNU General Public License v3.0

---

!!! tip "Getting Help"
Need assistance? Check the [GitHub Issues](https://github.com/SonnyTaylor/AutoService/issues) page for common questions, or open a new issue for bugs and feature requests.

**Version**: 0.4.0 | **Last Updated**: October 2025
