# FragDesk

A lightweight, performance-focused desktop companion for gamers and power users. FragDesk combines **macro automation**, **smart clipboard management**, and **real-time system/FPS monitoring** in one fast Tauri 2.0 desktop app, with a community library for sharing your setups.

## Features

### ⌨️ Macro Manager
- Record keyboard & mouse macros with a **global hotkey** (configurable, default `F9`) that works even when FragDesk isn't focused
- Playback controls with speed and repeat options, plus the ability to stop playback
- Assign per-macro playback hotkeys that persist across sessions
- Organize macros with **tags**, rename, and delete
- Import/export macros as JSON for sharing

### 📋 Clipboard Manager
- Automatic clipboard history with live monitoring
- Search, pin, delete, and copy items back to the clipboard
- Export/import clipboard snippets as JSON

### 📊 System Monitor
- Real-time **CPU, RAM, and GPU** metrics
- Per-core CPU breakdown
- **Alert rules** — get notified when a metric crosses a threshold (create, toggle, export/import)
- **Customizable layout** — show/hide, reorder, and manage dashboard widgets; share layouts with the community
- **FPS / 1% lows tracking** via RTSS/MSI Afterburner (reads frame-timing data without hooking games directly)

### 🎮 Gaming Utilities
- FPS and 1% low frame-time monitoring powered by RTSS
- Fragment system for one-click setup of macros and configurations

### 🧩 Fragment Library & Community
- **Architecture:** Fragments are portable, shareable bundles (macros, clipboard snippets, alert rules, and monitor layouts) with a versioned format
- **Bundled fragments** — a starter library of curated fragments shipped with FragDesk
- **Community Library** — browse, preview, filter by tags, and import fragments shared by others (Supabase-powered)
- Submit and manage your own fragments, track download counts, add/remove tags, and report problematic content

### ⚡ Productivity
- **Command Palette** — press `Ctrl+K` (or `Cmd+K`) to jump between tabs or play a macro instantly
- **First-run onboarding tour** for new users

## Tech Stack
- **Desktop Framework:** [Tauri 2.0](https://tauri.app/)
- **Frontend:** React 19 + TypeScript + TailwindCSS + Vite
- **Backend:** Rust
- **State Management:** Zustand
- **Storage:** SQLite (local)
- **Community Backend:** Supabase (auth + shared fragment storage)
- **UI:** framer-motion, lucide-react, recharts

## Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://rustup.rs/) (via rustup)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (Windows only — C++ workload required for Rust `windows` crate dependencies)
- Optional: [RTSS](https://www.guru3d.com/download/rtss-rivatuner-statistics-server-download/) / MSI Afterburner for FPS tracking
- Optional: Supabase project (for the Community Library) — see [Environment](#environment)

## Environment

The **Community Library** requires a connected Supabase project. Create a `.env` file in the project root with:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

The app degrades gracefully — without these variables, the Community Library shows a "Not set up yet" notice while all local features still work.

## Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/fragdesk.git
cd fragdesk
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run tauri dev
```

> **Note:** `npm run tauri dev` spawns its own Vite dev server — you typically don't need to run `npm run dev` separately. The Tauri dev server expects the frontend build tooling (Vite) to be available, which `npm install` handles.

### 4. Run Frontend Only (no Tauri window)
```bash
npm run dev
```

### 5. Build for Production
```bash
npm run tauri build
```

> **Important:** Always use `npm run tauri build` (not `npm run build`) for production — this produces the bundled desktop application.

## Key Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the Vite frontend only |
| `npm run build` | Type-check and build the frontend only |
| `npm run tauri dev` | Run the full desktop app in development |
| `npm run tauri build` | Build the production desktop app |

## Project Structure
```
fragdesk/
├── src/                          # React frontend
│   ├── components/
│   │   ├── dashboard/            # Dashboard home
│   │   ├── features/
│   │   │   ├── clipboard/        # Clipboard history
│   │   │   ├── command/          # Command palette (Ctrl/Cmd + K)
│   │   │   ├── community/        # Community library + auth
│   │   │   ├── fragments/        # Bundled fragment library
│   │   │   ├── macro/            # Macro manager
│   │   │   ├── monitor/          # System monitor + FPS
│   │   │   ├── onboarding/       # First-run tour
│   │   │   └── settings/         # Settings page
│   │   └── layout/               # Main layout & sidebar
│   ├── community/                # Supabase client & auth hooks
│   ├── types/                    # Shared TypeScript types
│   └── App.tsx                   # Main app + tab routing
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs               # Tauri entry point & command registry
│   │   ├── commands/
│   │   │   ├── macros.rs        # Macro recording/playback
│   │   │   ├── clipboard.rs     # Clipboard manager
│   │   │   ├── monitor.rs       # System stats
│   │   │   ├── monitor_layout.rs# Dashboard layout
│   │   │   ├── alerts.rs        # Alert rules
│   │   │   ├── fps.rs           # RTSS FPS tracking
│   │   │   ├── permissions.rs   # Recording permission checks
│   │   │   └── onboarding.rs    # Onboarding state
│   │   ├── database.rs          # SQLite schema & access
│   │   ├── fragments.rs         # Fragment format/import
│   │   └── rtss.rs              # RTSS integration
│   └── tauri.conf.json          # Tauri config (command mapping, etc.)
├── .env                         # Supabase keys (optional, see above)
└── package.json                 # Node dependencies
```

## Tauri Commands

All backend logic is exposed via `#[tauri::command]` functions registered in `src-tauri/src/lib.rs` and invoked from the frontend with `@tauri-apps/api/core`'s `invoke()`. Command mapping and permissions are configured in `tauri.conf.json` / the capabilities file.

## Team Workflow

### Creating a Feature Branch
```bash
# Always pull latest first
git pull origin main

# Create your feature branch
git checkout -b feature/your-feature-name

# Make changes, then commit
git add .
git commit -m "Add feature description"

# Push your branch
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

### Daily Development
1. Pull latest changes: `git pull origin main`
2. Create feature branch
3. Code your feature
4. Test it works: `npm run tauri dev`
5. Commit and push
6. Create Pull Request
7. Wait for team review
8. Merge after approval

## Team Members
- **Chamuditha Rajapaksha**
- **Shajeeve Balakrishnan**
- **Jaaishan Miranda**

## License
[MIT](LICENSE) — See LICENSE file for details
