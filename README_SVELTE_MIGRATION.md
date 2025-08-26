This project has a minimal Svelte + Vite scaffold for incremental migration.

Quick start (PowerShell):

# install deps

pnpm install

# frontend dev server (Vite)

pm run dev

# build frontend for Tauri

pm run build

# tauri dev (ensure Rust/toolchain installed)

pm run tauri:dev

Notes:

- Vite root is `src` and builds into `dist` for Tauri.
- Use `src/svelte-src` as a place to add Svelte pages/components while migrating.
- The existing router injects pages into `#content`. The sample Svelte entry mounts into that element.
