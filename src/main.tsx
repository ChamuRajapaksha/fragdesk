import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyPaletteById, getCachedPaletteId } from "./themes";

// Apply the cached palette before the first render so a custom palette
// doesn't flash the default neon theme on cold start. get_ui_theme in
// App.tsx then reconciles this with what the backend actually persists.
applyPaletteById(getCachedPaletteId());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
