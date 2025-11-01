# Development Setup

Get your development environment ready for AutoService.

!!! info "Prerequisites"

    ### Required Software

    - **Windows 10 or later** - Primary development target
    - **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
    - **pnpm** - Package manager (install globally: `npm install -g pnpm`)
    - **Rust** - Install from [rustup.rs](https://rustup.rs/)
    - **Python 3.9+** - Download from [python.org](https://www.python.org/)
    - **Git** - Download from [git-scm.com](https://git-scm.com/)

## Clone and Install

### Step 1: Clone Repository

```powershell
git clone https://github.com/SonnyTaylor/AutoService.git
cd AutoService
```

### Step 2: Install Node Dependencies

```powershell
pnpm install
```

This installs frontend dependencies from `package.json`.

### Step 3: Install Python Dependencies

```powershell
pip install -r runner/requirements.txt
```

This sets up the Python environment for the service runner.

### Step 4: Verify Rust Installation

```powershell
rustc --version
cargo --version
```

Both commands should print version numbers.

## Running in Development

### Frontend Only (Rarely Used)

```powershell
pnpm dev
```

Starts Vite dev server on `http://localhost:5173`. Frontend only, no backend.

### Full App with Tauri (Recommended)

!!! warning "Administrator Terminal Required"

    You **must** run this command in an administrator terminal. Tauri requires elevated privileges for system access and many AutoService features need admin rights.

```powershell
pnpm tauri dev
```

This command:

- Starts Vite dev server
- Compiles Rust backend
- Launches AutoService with hot-reload
- Recompiles on frontend and Rust changes

## Building for Production

```powershell
pnpm tauri build
```

Creates optimized executable at `src-tauri/target/release/autoservice.exe`.

The build process:

1. Compiles frontend (Vite)
2. Compiles Rust backend (Cargo)
3. Compiles Python runner (PyInstaller) if source is newer
4. Embeds all resources into executable
5. Creates portable executable

## Project Structure for Development

```
AutoService/
├── src/                    # Frontend source
│   ├── main.js             # Router
│   ├── pages/              # Page modules
│   ├── styles/             # CSS files
│   └── utils/              # Utility functions
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri config
├── runner/                 # Python runner
│   ├── service_runner.py   # Main script
│   ├── services/           # Service implementations
│   └── requirements.txt    # Python dependencies
├── data/                   # Data folder (portable)
├── package.json            # Node dependencies
├── pnpm-lock.yaml          # Dependency lock file
└── vite.config.js          # Vite configuration
```

## Development Commands

=== "Frontend"

    ```powershell title="Development Server"
    # Vite dev server (rarely used standalone)
    pnpm dev
    ```

    ```powershell title="Build Frontend"
    # Build for production
    pnpm build
    ```

    ```powershell title="Preview Build"
    # Preview production frontend
    pnpm preview
    ```

    ```powershell title="Run Tests"
    # Run Node.js native tests
    pnpm test
    ```

=== "Full App (Tauri)"

    ```powershell title="Development Mode"
    # Hot-reload frontend + Rust backend
    # MUST run in administrator terminal
    pnpm tauri dev
    ```

    ```powershell title="Production Build"
    # Create optimized executable
    pnpm tauri build
    ```

=== "Backend (Rust)"

    ```powershell title="Check Compilation"
    # Verify Rust code compiles
    cargo check
    ```

    ```powershell title="Run Tests"
    # Execute Rust tests
    cargo test
    ```

    ```powershell title="Build Backend"
    # Build Rust backend only
    cargo build
    ```

=== "Python Runner"

    ```powershell title="Test Service"
    # Test individual service with fixture
    python runner/service_runner.py runner/fixtures/test_bleachbit.json
    ```

    ```powershell title="Verify Syntax"
    # Check Python syntax
    python -m py_compile runner/service_runner.py
    ```

    ```powershell title="Install Dependencies"
    # Install Python packages
    pip install -r runner/requirements.txt
    ```

!!! note "No cargo watch Required"
    The `cargo watch` tool is **not** required or configured for this project. Use `pnpm tauri dev` for hot-reload during development.

## IDE Setup

### Visual Studio Code

Recommended extensions:

- **Rust Analyzer** - Rust language support
- **Tauri** - Tauri framework support
- **Python** - Python language support
- **Vite** - Vite support
- **ES7+ React/Redux/React-Native snippets** - JS snippets

### Settings for Consistent Development

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "[python]": {
    "editor.defaultFormatter": "ms-python.python",
    "editor.formatOnSave": true
  },
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer",
    "editor.formatOnSave": true
  },
  "[javascript]": {
    "editor.formatOnSave": false
  }
}
```

## Debugging

### Debug Frontend

1. Open DevTools: `Ctrl+Shift+I` in dev mode
2. Use Console for logs
3. Set breakpoints in Sources tab
4. Use debugger statements in code

### Debug Rust Backend

```powershell
# Set breakpoints and run with debugger
cargo run --debug

# Or use VS Code debugger with CodeLLDB extension
```

### Debug Python Runner

```powershell
# Run with Python debugger
python -m pdb runner/service_runner.py runner/fixtures/test_bleachbit.json

# Or add breakpoints in IDE
```

## Common Issues

!!! failure "Error: 'Tauri requires admin privileges'"

    **Solution**: Run terminal as Administrator before `pnpm tauri dev`

!!! failure "Error: 'Rust toolchain not found'"

    **Solution**: Install Rust from [rustup.rs](https://rustup.rs/) and restart terminal

!!! failure "Error: 'Python not found'"

    **Solution**: Ensure Python is installed and in PATH; restart terminal after installation

!!! failure "Error: 'pnpm: command not found'"

    **Solution**: Install pnpm globally: `npm install -g pnpm`

!!! warning "Hot-reload not working"

    **Solution**: Ensure you're running `pnpm tauri dev` from admin terminal, not `pnpm dev`

## Next Steps

- [Architecture Overview](architecture.md) - Understand the design
- [Adding a Service](adding-service.md) - Create new functionality
- [Frontend Development](frontend-dev.md) - Work on UI
- [Backend Development](backend-dev.md) - Work on Rust code

---

Need help? Check the [README](../../README.md) or open an issue on [GitHub](https://github.com/SonnyTaylor/AutoService/issues).
