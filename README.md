# FragDesk

A lightweight desktop application featuring macro automation, clipboard management, and gaming utilities.

## Features (Planned)
- ⌨️ **Macro System** - Record and playback keyboard/mouse macros
- 📋 **Clipboard Manager** - Smart clipboard history with search
- 📊 **System Monitor** - Real-time CPU, RAM, GPU monitoring
- 🎮 **Gaming Utilities** - Performance tools for gamers

## Tech Stack
- **Desktop Framework:** Tauri 2.0
- **Frontend:** React + TypeScript + TailwindCSS
- **Backend:** Rust
- **State Management:** Zustand
- **Storage:** SQLite

## Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://rustup.rs/)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (Windows only - C++ workload)

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

### 4. Build for Production
```bash
npm run tauri build
```

## Project Structure
```
fragdesk/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── stores/             # Zustand state stores
│   └── App.tsx             # Main app component
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs        # Entry point
│   │   └── commands/      # Tauri commands
│   └── Cargo.toml         # Rust dependencies
└── package.json           # Node dependencies
```

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
MIT License - See LICENSE file for details
