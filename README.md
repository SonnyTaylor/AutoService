# AutoService
![AutoService HackaTime Badge](https://hackatime-badge.hackclub.com/U091U1C7EFL/RustService)

**AutoService** is a Windows 10/11 USB-based diagnostic and cleanup tool designed to automatically run virus scanners, hardware diagnostics, and stress tests, then generate detailed reports for customers or users. It aims to streamline tech support tasks by providing a one-stop toolkit for system health checks, cleaning, and component testing.

---

## 🚀 Features (Work in Progress)

- **Automatic Virus Scanning & Cleaning**  
  Integrates portable scanners like:
  - KVRT (Kaspersky Virus Removal Tool)
  - Malwarebytes (MBAR)
  - HitmanPro
  - CCleaner
  - CrystalDiskInfo
  - *(More planned)*

- **System & Hardware Info Gathering**
  - Battery and disk health
  - RAM, CPU, GPU, motherboard details
  - Temperatures (CPU/GPU/etc.)
  - Driver info (versions, missing drivers)
  - Installed software list

- **Diagnostics & Utilities**
  - Memory tests (Windows Memory Diagnostic, MemTest)
  - Disk checks (`chkdsk`)
  - WReset (modified Windows reset tool)
  - MS Activation Scripts
  - Driver installation (e.g., GIGA driver pack)
  - Office installers (2010, 2016, 2021, 365, etc.)

- **Stress Testing**
  - CPU (e.g., Prime95)
  - GPU (e.g., FurMark)
  - Disk read/write
  - RAM
  - Network/Wi-Fi stability

- **Component Testing**
  - Speaker test (left/right)
  - Microphone test
  - Camera preview
  - Keyboard visual tester
  - Screen test (color cycling, dead/stuck pixel detection)

- **Tools & Scripts**
  - Extract stored email passwords
  - Extract Windows credentials (with user warning)
  - Built-in shortcut menu for common repair tools
  - JSON-based config file for custom settings

- **Reports**
  - JSON and PDF reports summarizing findings
  - Email report support via SMTP or Mailgun/SendGrid

---

## 👤 Intended Users

Tech support professionals and general users needing a portable, powerful diagnostics and cleanup suite that runs directly off a USB drive.

---

## 🧠 How to Use

1. Copy the entire AutoService folder (including the `data/` directory) to a USB stick or any local drive.
2. Launch the program via `AutoService.exe` or run `python main.py` (during development).
3. Use the interface to run tools, view diagnostics, and generate reports.
4. Optional: Configure email settings to auto-send reports to customers.


> ⚠️ **Scanner tools must be added manually to the `data/` folder.**  
> They are not included in the repository for licensing reasons.

---

## 🧪 Project Status

- ✅ Proof of concept running  
- ⚙️ Active development phase  
- 🔜 Many features are in progress or planned

---


## 🛠 Known Issues & Limitations

- Early-stage prototype with placeholder elements  
- External tools must be manually downloaded and placed in `data/`  
- Windows 10/11 required  
- No GUI error handling yet

---
