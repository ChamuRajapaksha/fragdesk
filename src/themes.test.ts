import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  PERSISTED_PALETTE_KEY,
  applyPalette,
  applyPaletteById,
  getCachedPaletteId,
  getPaletteById,
} from "./themes";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

describe("applyPalette", () => {
  it("writes every palette color to a CSS custom property", () => {
    const palette = PALETTES[0];
    applyPalette(palette);

    for (const [key, value] of Object.entries(palette.colors)) {
      expect(document.documentElement.style.getPropertyValue(`--frag-${key}`)).toBe(value);
    }
  });

  it("persists the palette id", () => {
    applyPalette(PALETTES[1]);
    expect(localStorage.getItem(PERSISTED_PALETTE_KEY)).toBe(PALETTES[1].id);
  });
});

describe("getCachedPaletteId", () => {
  it("returns a persisted id that still exists", () => {
    localStorage.setItem(PERSISTED_PALETTE_KEY, PALETTES[2].id);
    expect(getCachedPaletteId()).toBe(PALETTES[2].id);
  });

  it("falls back to the default for unknown ids", () => {
    localStorage.setItem(PERSISTED_PALETTE_KEY, "does-not-exist");
    expect(getCachedPaletteId()).toBe(DEFAULT_PALETTE_ID);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(getCachedPaletteId()).toBe(DEFAULT_PALETTE_ID);
  });
});

describe("getPaletteById", () => {
  it("returns the matching palette", () => {
    expect(getPaletteById(PALETTES[3].id)).toBe(PALETTES[3]);
  });

  it("falls back to the first palette for unknown ids", () => {
    expect(getPaletteById("does-not-exist")).toBe(PALETTES[0]);
  });
});

describe("applyPaletteById", () => {
  it("applies and persists the requested palette", () => {
    applyPaletteById(PALETTES[4].id);

    expect(localStorage.getItem(PERSISTED_PALETTE_KEY)).toBe(PALETTES[4].id);
    expect(document.documentElement.style.getPropertyValue("--frag-bg")).toBe(
      PALETTES[4].colors.bg,
    );
  });
});
