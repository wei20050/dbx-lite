// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentLocale, previewLocale, restoreLocalePreview, setLocale } from "@/i18n";

const delayedChineseLocale = vi.hoisted(() => {
  let resolveLocaleModule: ((module: { default: Record<string, unknown> }) => void) | undefined;
  let pendingLocaleModule: Promise<{ default: Record<string, unknown> }>;

  function reset() {
    pendingLocaleModule = new Promise((resolve) => {
      resolveLocaleModule = resolve;
    });
  }

  reset();

  return {
    reset,
    load: () => pendingLocaleModule,
    resolve: () => resolveLocaleModule?.({ default: {} }),
  };
});

vi.mock("@/i18n/locales/zh-CN", () => delayedChineseLocale.load());

describe("locale preview", () => {
  beforeEach(async () => {
    delayedChineseLocale.reset();
    await setLocale("en");
    window.localStorage.clear();
  });

  afterEach(async () => {
    await setLocale("en");
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // Declared first: this is the only case that needs the lazy import to still be pending.
  it("persists an explicit choice before its delayed messages become visible", async () => {
    const selected = setLocale("zh-CN");

    expect(window.localStorage.getItem("dbx-locale")).toBe("zh-CN");
    expect(currentLocale()).toBe("en");

    delayedChineseLocale.resolve();
    await selected;

    expect(currentLocale()).toBe("zh-CN");
  });

  it("changes the visible locale without persisting a hover preview", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");

    await previewLocale("zh-CN");

    expect(currentLocale()).toBe("zh-CN");
    expect(setItem).not.toHaveBeenCalled();

    await restoreLocalePreview();
    expect(currentLocale()).toBe("en");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("keeps an explicit selection when its list closes before the messages load", async () => {
    const selected = setLocale("zh-CN");
    const restore = restoreLocalePreview();

    await Promise.all([selected, restore]);

    expect(currentLocale()).toBe("zh-CN");
    expect(window.localStorage.getItem("dbx-locale")).toBe("zh-CN");
  });
});
