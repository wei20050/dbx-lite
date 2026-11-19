import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
const savedFile = { id: "saved", connectionId: "conn", database: "db", name: "saved.sql", sql: "SELECT 1;", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" };
const mocks = vi.hoisted(() => ({ saved: null as any }));
vi.mock("@/lib/backend/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backend/api")>()),
  loadOpenTabsState: async () => mocks.saved,
  saveOpenTabsState: async (payload: unknown) => {
    mocks.saved = payload;
  },
  listDetachedTabHandoffs: async () => [],
}));
describe("draft recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.saved = null;
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    setActivePinia(createPinia());
  });
  it.each(["", "SELECT 2;"])("preserves a saved SQL draft %j through restore and file hydration", async (sql) => {
    const { useQueryStore } = await import("@/stores/queryStore");
    const { useSettingsStore } = await import("@/stores/settingsStore");
    const { useSavedSqlStore } = await import("@/stores/savedSqlStore");
    const store = useQueryStore();
    const id = store.createTab("conn", "db");
    Object.assign(
      store.tabs.find((tab) => tab.id === id)!,
      { savedSqlId: "saved", sql, originalSql: "SELECT 1;" },
    );
    await store.flushPendingPersist();
    setActivePinia(createPinia());
    useSettingsStore().updateEditorSettings({ openTabsRestoreMode: "all", confirmUnsavedSqlClose: false });
    const ensureFileContent = vi.spyOn(useSavedSqlStore(), "ensureFileContent");
    const restored = useQueryStore();
    await restored.initOpenTabs({ validConnectionIds: ["conn"] });
    await restored.hydrateSavedSqlTabs();
    const tab = restored.tabs.find((tab) => tab.id === id)!;
    expect(tab.sql).toBe(sql);
    expect(tab.originalSql).toBe("SELECT 1;");
    expect(restored.isTabDirty(tab)).toBe(true);
    expect(ensureFileContent).not.toHaveBeenCalled();
    expect(restored.openSavedSql(savedFile)).toBe(id);
    expect(tab.sql).toBe(sql);
    expect(tab.originalSql).toBe("SELECT 1;");
    expect(restored.isTabDirty(tab)).toBe(true);
    ensureFileContent.mockRestore();
  });

  it("loads file content when reopening a clean restored SQL library tab", async () => {
    const { useQueryStore } = await import("@/stores/queryStore");
    const { useSettingsStore } = await import("@/stores/settingsStore");
    const store = useQueryStore();
    const id = store.openSavedSql(savedFile);
    await store.flushPendingPersist();
    setActivePinia(createPinia());
    useSettingsStore().updateEditorSettings({ openTabsRestoreMode: "all" });
    const restored = useQueryStore();
    await restored.initOpenTabs({ validConnectionIds: ["conn"] });
    const tab = restored.tabs.find((tab) => tab.id === id)!;
    expect(tab.sql).toBe("");
    expect(tab.originalSql).toBeUndefined();
    expect(restored.openSavedSql(savedFile)).toBe(id);
    expect(tab.sql).toBe(savedFile.sql);
    expect(tab.originalSql).toBe(savedFile.sql);
    expect(restored.isTabDirty(tab)).toBe(false);
  });

  it("does not restore drafts when open-tab restore is disabled", async () => {
    const { useQueryStore } = await import("@/stores/queryStore");
    const { useSettingsStore } = await import("@/stores/settingsStore");
    const settings = useSettingsStore();
    settings.updateEditorSettings({ openTabsRestoreMode: "none", confirmUnsavedSqlClose: false });
    const store = useQueryStore();
    const sqlId = store.createTab("conn", "db");
    store.updateSql(sqlId, "select unsaved;");
    await store.flushPendingPersist();
    setActivePinia(createPinia());
    useSettingsStore().updateEditorSettings({ openTabsRestoreMode: "none", confirmUnsavedSqlClose: false });
    const restored = useQueryStore();
    await restored.initOpenTabs({ validConnectionIds: ["conn"] });
    expect(restored.tabs).toEqual([]);
  });
});
