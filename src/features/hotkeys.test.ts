import { describe, expect, it } from "vitest";
import { comboFromKeyboardEvent, formatHotkey } from "./hotkeys";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("comboFromKeyboardEvent", () => {
  it("returns null for modifier-only presses", () => {
    expect(
      comboFromKeyboardEvent(keydown({ key: "Control", code: "ControlLeft", ctrlKey: true })),
    ).toBeNull();
    expect(
      comboFromKeyboardEvent(keydown({ key: "Shift", code: "ShiftLeft", shiftKey: true })),
    ).toBeNull();
  });

  it("returns null when there is no physical key code", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "a", code: "" }))).toBeNull();
  });

  it("emits CommandOrControl for Ctrl or Meta", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "a", code: "KeyA", ctrlKey: true }))).toBe(
      "CommandOrControl+KeyA",
    );
    expect(comboFromKeyboardEvent(keydown({ key: "a", code: "KeyA", metaKey: true }))).toBe(
      "CommandOrControl+KeyA",
    );
  });

  it("keeps modifiers in a stable order", () => {
    expect(
      comboFromKeyboardEvent(
        keydown({ key: "F9", code: "F9", shiftKey: true, altKey: true, ctrlKey: true }),
      ),
    ).toBe("CommandOrControl+Alt+Shift+F9");
  });

  it("returns a bare key when no modifiers are held", () => {
    expect(comboFromKeyboardEvent(keydown({ key: "F9", code: "F9" }))).toBe("F9");
  });
});

describe("formatHotkey", () => {
  it("renders canonical modifier names for humans", () => {
    expect(formatHotkey("shift+control+F9")).toBe("Shift+Ctrl+F9");
    expect(formatHotkey("CommandOrControl+Alt+KeyA")).toBe("Ctrl+Alt+KeyA");
  });

  it("leaves unknown key names untouched", () => {
    expect(formatHotkey("control+KeyQ")).toBe("Ctrl+KeyQ");
  });
});
