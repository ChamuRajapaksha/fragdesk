/**
 * Shared hotkey capture/display helpers.
 *
 * Every UI surface that lets the user record a combo (Settings and the
 * Macro Manager) must emit the same string the Rust side parses. Keeping
 * that logic here avoids the two copies drifting apart again.
 */

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift"]);

/**
 * Converts a keydown event into the string format the global-shortcut
 * plugin accepts (`CommandOrControl+Alt+KeyA`). Returns `null` for
 * modifier-only presses and anything without a physical key code, so
 * callers can keep waiting for a complete combo.
 */
export function comboFromKeyboardEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (!e.code) return null;

  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  return [...mods, e.code].join("+");
}

const MODIFIER_LABELS: Record<string, string> = {
  commandorcontrol: "Ctrl",
  commandorctrl: "Ctrl",
  cmdorctrl: "Ctrl",
  cmdorcontrol: "Ctrl",
  control: "Ctrl",
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  super: "Super",
  meta: "Meta",
  command: "Cmd",
  cmd: "Cmd",
};

/** Renders a stored (possibly canonical, lowercase) hotkey for humans. */
export function formatHotkey(hotkey: string): string {
  return hotkey
    .split("+")
    .map((part) => MODIFIER_LABELS[part.toLowerCase()] ?? part)
    .join("+");
}
