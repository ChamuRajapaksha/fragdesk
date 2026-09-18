# FragDesk - Project Architecture Guide

## 📂 Folder Structure

```
fragdesk/
├── src/                                # Frontend (React + TypeScript)
│   ├── components/                     # All React components
│   │   ├── ui/                        # Reusable UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Tooltip.tsx
│   │   │
│   │   ├── layout/                    # Layout components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   └── MainLayout.tsx
│   │   │
│   │   └── features/                  # Feature-specific components
│   │       ├── clipboard/
│   │       │   ├── ClipboardHistory.tsx
│   │       │   ├── ClipboardItem.tsx
│   │       │   └── ClipboardSearch.tsx
│   │       │
│   │       ├── macros/
│   │       │   ├── MacroEditor.tsx
│   │       │   ├── MacroList.tsx
│   │       │   ├── MacroRecorder.tsx
│   │       │   └── MacroPlayer.tsx
│   │       │
│   │       ├── monitor/
│   │       │   ├── CpuGraph.tsx
│   │       │   ├── RamGraph.tsx
│   │       │   ├── GpuStats.tsx
│   │       │   └── SystemOverview.tsx
│   │       │
│   │       └── settings/
│   │           ├── GeneralSettings.tsx
│   │           ├── ThemeSettings.tsx
│   │           └── HotkeySettings.tsx
│   │
│   ├── stores/                        # Zustand state management
│   │   ├── clipboardStore.ts
│   │   ├── macroStore.ts
│   │   ├── monitorStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts
│   │
│   ├── hooks/                         # Custom React hooks
│   │   ├── useClipboard.ts
│   │   ├── useMacro.ts
│   │   ├── useSystemStats.ts
│   │   └── useKeyboard.ts
│   │
│   ├── lib/                           # Utilities & helpers
│   │   ├── tauri.ts                  # Tauri command wrappers
│   │   ├── utils.ts                  # General utilities
│   │   ├── formatters.ts             # Data formatters
│   │   └── constants.ts              # App constants
│   │
│   ├── types/                         # TypeScript types
│   │   ├── clipboard.ts
│   │   ├── macro.ts
│   │   ├── monitor.ts
│   │   └── index.ts
│   │
│   ├── styles/                        # Global styles
│   │   ├── globals.css
│   │   └── themes.css
│   │
│   ├── App.tsx                        # Main app component
│   ├── main.tsx                       # Entry point
│   └── vite-env.d.ts
│
├── src-tauri/                         # Backend (Rust)
│   ├── src/
│   │   ├── commands/                  # Tauri commands (Frontend ↔ Backend)
│   │   │   ├── clipboard.rs
│   │   │   ├── macros.rs
│   │   │   ├── monitor.rs
│   │   │   └── settings.rs
│   │   │
│   │   ├── services/                  # Business logic
│   │   │   ├── clipboard_service.rs
│   │   │   ├── macro_service.rs
│   │   │   └── monitor_service.rs
│   │   │
│   │   ├── database/                  # SQLite management
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs
│   │   │   ├── clipboard_db.rs
│   │   │   └── macro_db.rs
│   │   │
│   │   ├── models/                    # Data structures
│   │   │   ├── clipboard.rs
│   │   │   ├── macro.rs
│   │   │   └── system_stats.rs
│   │   │
│   │   ├── utils/                     # Rust utilities
│   │   │   ├── keyboard.rs
│   │   │   └── helpers.rs
│   │   │
│   │   ├── main.rs                    # Entry point
│   │   └── lib.rs                     # Library exports
│   │
│   ├── Cargo.toml                     # Rust dependencies
│   ├── tauri.conf.json                # Tauri configuration
│   └── build.rs
│
├── public/                            # Static assets
│   └── icons/
│
├── .github/                           # GitHub config
│   └── workflows/
│       └── build.yml                  # CI/CD (optional)
│
├── docs/                              # Documentation
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   └── TEAM_WORKFLOW.md
│
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🗄️ Database Schema (SQLite)

### **clipboard_history** table
```sql
CREATE TABLE clipboard_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL,  -- 'text', 'image', 'file'
    timestamp INTEGER NOT NULL,
    is_pinned BOOLEAN DEFAULT 0,
    app_source TEXT,
    char_count INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_timestamp ON clipboard_history(timestamp DESC);
CREATE INDEX idx_pinned ON clipboard_history(is_pinned);

-- Full-text search
CREATE VIRTUAL TABLE clipboard_fts USING fts5(content, content_tokenize='porter');
```

### **macros** table
```sql
CREATE TABLE macros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    hotkey TEXT,
    events BLOB NOT NULL,  -- JSON blob of recorded events
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_enabled BOOLEAN DEFAULT 1,
    play_count INTEGER DEFAULT 0
);

CREATE INDEX idx_hotkey ON macros(hotkey);
```

### **settings** table
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

---

## 🎯 Feature Ownership (3-Person Team)

### **Person 1: Clipboard Manager**
- `src/components/features/clipboard/`
- `src/stores/clipboardStore.ts`
- `src-tauri/src/commands/clipboard.rs`
- `src-tauri/src/services/clipboard_service.rs`
- `src-tauri/src/database/clipboard_db.rs`

### **Person 2: System Monitor**
- `src/components/features/monitor/`
- `src/stores/monitorStore.ts`
- `src-tauri/src/commands/monitor.rs`
- `src-tauri/src/services/monitor_service.rs`

### **Person 3: Macro System**
- `src/components/features/macros/`
- `src/stores/macroStore.ts`
- `src-tauri/src/commands/macros.rs`
- `src-tauri/src/services/macro_service.rs`
- `src-tauri/src/database/macro_db.rs`

### **Shared Responsibility:**
- `src/components/ui/` - Everyone can contribute
- `src/components/layout/` - Person 1 (after clipboard is done)
- `src/components/features/settings/` - Person 2 (after monitor is done)
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
- **Framework:** React 18 + TypeScript
- **State:** Zustand (lightweight, no boilerplate)
- **Styling:** TailwindCSS + Framer Motion
- **Charts:** Recharts (for system monitor graphs)
- **Build:** Vite

### **Backend**
- **Language:** Rust
- **Framework:** Tauri 2.0
- **Async:** Tokio
- **Database:** rusqlite
- **Input Handling:** rdev + enigo

### **Database**
- **Engine:** SQLite 3
- **ORM:** Direct SQL (via rusqlite)
- **Migrations:** Manual SQL files in `src-tauri/migrations/`

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