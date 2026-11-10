# FragDesk - Project Architecture Guide

## 📂 Folder Structure

```
fragdesk/
├── src/                                # Frontend (React 19 + TypeScript)
│   ├── components/
│   │   ├── ui/                        # Reusable UI primitives (Button, Card,
│   │   │                              #   StatCard, Modal, toast, ErrorBoundary, ...)
│   │   ├── layout/                    # MainLayout.tsx, Sidebar.tsx
│   │   ├── dashboard/                 # DashboardHome.tsx
│   │   └── features/
│   │       ├── clipboard/             # ClipboardHistory.tsx, ClipboardItemRow.tsx
│   │       ├── command/               # CommandPalette.tsx (Ctrl/Cmd + K)
│   │       ├── community/             # CommunityLibrary + Auth/Preview/Report/Filter
│   │       ├── fragments/             # FragmentLibrary.tsx (bundled fragments)
│   │       ├── macro/                 # MacroManager.tsx, MacroCard.tsx
│   │       ├── monitor/               # SystemMonitor.tsx (charts, alerts, layout)
│   │       ├── onboarding/            # OnboardingTour.tsx
│   │       └── settings/              # SettingsPage.tsx, AccountSection.tsx
│   │
│   ├── community/                     # Supabase client and auth context
│   │   ├── supabaseClient.ts
│   │   ├── AuthContext.ts
│   │   ├── AuthProvider.tsx           # Single app-wide auth subscription
│   │   └── useAuth.ts                 # Consumer hook (user, loading, signOut)
│   │
│   ├── features/                      # Frontend feature infrastructure
│   │   ├── registry.tsx               # Typed feature registry (nav/pages)
│   │   ├── hotkeys.ts                 # Hotkey format/capture helpers
│   │   ├── hotkeys.test.ts
│   │   └── dataEvents.ts              # Tauri event subscriptions (e.g. data-wiped)
│   │
│   ├── types/                         # Shared TypeScript types
│   ├── themes.ts                      # Palette definitions + applyPalette()
│   ├── App.tsx                        # Main app + tab routing + providers
│   ├── App.css                        # Global styles / CSS custom properties
│   ├── main.tsx                       # Entry point
│   └── test/setup.ts                  # Vitest + jest-dom setup
│
├── src-tauri/                         # Backend (Rust)
│   ├── src/
│   │   ├── commands/                  # Tauri commands (Frontend ↔ Backend)
│   │   │   ├── macros.rs              # Macro recording/playback/hotkeys
│   │   │   ├── clipboard.rs           # Clipboard CRUD + monitor worker
│   │   │   ├── monitor.rs             # CPU/RAM stats
│   │   │   ├── gpu.rs                 # GPU stats (DXGI/PDH)
│   │   │   ├── fps.rs                 # RTSS FPS poller
│   │   │   ├── monitor_layout.rs      # Dashboard widget layout
│   │   │   ├── alerts.rs              # Alert rules
│   │   │   ├── onboarding.rs          # Onboarding state
│   │   │   ├── theme.rs               # Persisted UI palette
│   │   │   ├── data.rs                # Wipe / factory reset
│   │   │   ├── permissions.rs         # Recording permission checks
│   │   │   └── mod.rs                 # DbState helpers (with_db / with_db_handle)
│   │   │
│   │   ├── database/mod.rs            # SQLite connection, migrations, all queries
│   │   ├── fragments.rs               # Fragment format/import/export
│   │   ├── gpu.rs                     # Native GPU sampling
│   │   ├── rtss.rs                    # RTSS shared-memory reader
│   │   ├── hotkey.rs                  # Canonical shortcut parser
│   │   ├── lib.rs                     # Tauri entry point & command registry
│   │   └── main.rs                    # Binary entry
│   │
│   ├── capabilities/default.json      # Tauri permissions/capabilities
│   ├── Cargo.toml                     # Rust dependencies
│   ├── tauri.conf.json                # Tauri configuration (CSP, window, ...)
│   └── build.rs
│
├── supabase/                          # SQL applied in the Supabase dashboard
│   ├── schema.sql
│   ├── supabase_auth_migration.sql
│   ├── reports_migration.sql
│   └── delete_account_migration.sql
│
├── .github/workflows/                 # CI (Ubuntu + Windows jobs)
├── docs/ARCHITECTURE.md
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## 🗄️ Database Schema (SQLite)

The schema lives in `src-tauri/src/database/mod.rs` and is applied through
ordered migrations tracked in `PRAGMA user_version` (currently version 2).
There is no separate migrations directory.

### **clipboard_history** table

```sql
CREATE TABLE clipboard_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL,  -- currently always 'text'
    timestamp INTEGER NOT NULL,
    is_pinned BOOLEAN DEFAULT 0
);

-- History is fetched pinned-first, then newest-first.
CREATE INDEX idx_clipboard_order
    ON clipboard_history(is_pinned DESC, timestamp DESC, id DESC);
```

### **macros** table

```sql
CREATE TABLE macros (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    events_json TEXT NOT NULL,  -- JSON array of recorded events
    hotkey TEXT,
    tags TEXT,
    source TEXT
);

CREATE INDEX idx_macros_created_at ON macros(created_at DESC);
```

### **monitor_alert_rules** table

```sql
CREATE TABLE monitor_alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    comparison TEXT NOT NULL,
    threshold REAL NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    source TEXT,
    created_at INTEGER NOT NULL
);
```

### **settings** table

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## 🎯 Feature Ownership (3-Person Team)

### **Person 1: Clipboard Manager**

- `src/components/features/clipboard/`
- `src-tauri/src/commands/clipboard.rs`
- Clipboard queries in `src-tauri/src/database/mod.rs`

### **Person 2: System Monitor**

- `src/components/features/monitor/`
- `src-tauri/src/commands/monitor.rs`
- `src-tauri/src/commands/gpu.rs`
- `src-tauri/src/commands/fps.rs`
- `src-tauri/src/gpu.rs`
- `src-tauri/src/rtss.rs`

### **Person 3: Macro System**

- `src/components/features/macro/`
- `src-tauri/src/commands/macros.rs`
- `src-tauri/src/hotkey.rs`
- Macro queries in `src-tauri/src/database/mod.rs`

### **Shared Responsibility:**

- `src/components/ui/` - Everyone can contribute
- `src/components/layout/` - Person 1 (after clipboard is done)
- `src/components/features/settings/` - Person 2 (after monitor is done)
- `src/features/registry.tsx` - Everyone (new pages must be registered here)
- Testing & bug fixes - Everyone

---

## 📋 Development Workflow

### **Branch Naming Convention**

```
feature/clipboard-history
feature/macro-recorder
feature/system-monitor-ui
fix/clipboard-crash
refactor/database-schema
```

### **Commit Message Format**

```
feat: Add clipboard history search
fix: Resolve macro playback timing issue
refactor: Improve database connection pooling
docs: Update architecture guide
```

### **Pull Request Template**

```markdown
## What does this PR do?

Brief description

## Type of change

- [ ] New feature
- [ ] Bug fix
- [ ] Refactoring
- [ ] Documentation

## Testing

- [ ] Tested on Windows
- [ ] No console errors
- [ ] Existing features still work

## Screenshots (if UI changes)

[Add screenshots]
```

---

## 🔧 Tech Stack Details

### **Frontend**

- **Framework:** React 19 + TypeScript
- **State:** Local component state plus a single React Context
  (`AuthProvider`) for auth. There is no Zustand or global client store.
- **Styling:** TailwindCSS + Framer Motion
- **Charts:** Recharts (for system monitor graphs)
- **Build:** Vite (Vitest + Testing Library for tests)

### **Backend**

- **Language:** Rust
- **Framework:** Tauri 2.0
- **Async:** Tauri's async commands; blocking sampling runs on `spawn_blocking`
- **Database:** rusqlite (one managed connection behind a mutex)
- **Input Handling:** global-shortcut plugin + rdev + enigo

### **Database**

- **Engine:** SQLite 3
- **ORM:** Direct SQL (via rusqlite)
- **Migrations:** Versioned in `src-tauri/src/database/mod.rs`, tracked by
  `PRAGMA user_version`

---

## 🚀 Getting Started (For Team Members)

### **Initial Setup**

```bash
git clone https://github.com/ChamuRajapaksha/fragdesk.git
cd fragdesk
npm install
npm run tauri dev
```

### **Before Starting Work**

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### **Daily Workflow**

```bash
# Make changes...
git add .
git commit -m "feat: Your feature description"
git push origin feature/your-feature-name
# Create PR on GitHub
```

---

## 📊 Milestones

### **v0.1.0 - MVP (4-6 weeks)**

- ✅ Project setup
- [ ] Basic UI with navigation
- [ ] Clipboard manager (basic)
- [ ] System monitor (CPU + RAM)
- [ ] Settings page

### **v0.2.0 - Core Features (8-10 weeks)**

- [ ] Clipboard with search
- [ ] Macro recorder
- [ ] Macro playback
- [ ] GPU monitoring
- [ ] Hotkey system

### **v0.3.0 - Polish (12-14 weeks)**

- [ ] Advanced macro editing
- [ ] Export/import features
- [ ] Auto-update system
- [ ] Performance optimizations
- [ ] Windows installer

---

## 🎨 UI Design System

### **Colors**

The `frag.*` Tailwind tokens resolve to CSS custom properties at runtime, so
the palette can be switched live. `src/App.css` defines the `:root` defaults
(space-separated RGB triplets), `src/themes.ts` holds the curated palettes
and `applyPalette()`, and Tauri commands `get_ui_theme` / `set_ui_theme`
persist the chosen palette id in the settings table.

```typescript
// tailwind.config.js
colors: {
  frag: {
    bg: 'rgb(var(--frag-bg) / <alpha-value>)',        // Dark navy background
    surface: 'rgb(var(--frag-surface) / <alpha-value>)', // Slightly lighter surface
    primary: 'rgb(var(--frag-primary) / <alpha-value>)',  // Cyan accent
    accent: 'rgb(var(--frag-accent) / <alpha-value>)',    // Purple accent
    danger: 'rgb(var(--frag-danger) / <alpha-value>)',    // Red for alerts
    success: 'rgb(var(--frag-success) / <alpha-value>)',  // Green for success
    text: 'rgb(var(--frag-text) / <alpha-value>)',        // Light text
    muted: 'rgb(var(--frag-muted) / <alpha-value>)',      // Muted text
  }
}
```

```css
/* src/App.css */
:root {
  --frag-bg: 10 14 39;
  --frag-primary: 0 217 255;
  /* ... full default palette */
}
```

### **Component Philosophy**

- Dark theme by default
- Smooth animations (Framer Motion)
- Gaming aesthetic (neon accents, glows)
- Clean, minimal interface
- Responsive (even though it's desktop)

---

## 📞 Communication

### **Daily Standup (5 min)**

- What did you work on yesterday?
- What are you working on today?
- Any blockers?

### **Code Review Checklist**

- [ ] Code follows TypeScript/Rust conventions
- [ ] No console errors
- [ ] Commented complex logic
- [ ] Tested manually
- [ ] No merge conflicts

### **When to Ask for Help**

- Stuck for 30+ minutes → Ask in Discord
- Breaking changes → Notify team first
- Unsure about architecture → Discuss before implementing

---

## 🔐 Security Considerations

- Never commit API keys or secrets
- Use environment variables for configs
- Sanitize user inputs
- Be careful with global keyboard hooks (anti-cheat detection)
- Add disclaimers about macro usage in games

---

This architecture is designed to:

- ✅ Scale as features are added
- ✅ Allow 3 people to work simultaneously without conflicts
- ✅ Keep code organized and maintainable
- ✅ Make onboarding new team members easy
- ✅ Support future features (Android/iOS via Tauri mobile)
