import type { NavigationTarget } from "@/composables/useNavigationTargets";

export function useTauriEvents(deps: {
  openTableTarget: (target: NavigationTarget) => Promise<void>;
  openSqlFilePath: (path: string) => Promise<void>;
  openDbFilePath: (path: string) => Promise<void>;
  openConnectionDeepLink: (url: string) => Promise<void>;
  openAiConfigDeepLink: (url: string) => Promise<void>;
  closeActiveSurface: () => void;
  refreshPluginWorkbenches: (pluginId: string) => void;
}) {
  const unlistenHandles: Array<() => void> = [];

  function focusCurrentWindow() {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .setFocus()
        .catch(() => {}),
    );
  }

  function setupTauriListeners(): Promise<void> {
    return import("@tauri-apps/api/event")
      .then(({ listen }) => {
        const registrations: Promise<void>[] = [];
        const track = (registration: Promise<() => void>) => {
          registrations.push(
            registration.then((unlisten) => {
              unlistenHandles.push(unlisten);
            }),
          );
        };

        track(
          listen<string[]>("dbx-open-sql-files", async (event) => {
            try {
              for (const path of event.payload) {
                await deps.openSqlFilePath(path);
              }
              focusCurrentWindow();
            } catch (e) {
              console.error("[DBX] dbx-open-sql-files error:", e);
            }
          }),
        );

        track(
          listen<string[]>("dbx-open-db-files", async (event) => {
            try {
              for (const path of event.payload) {
                await deps.openDbFilePath(path);
              }
              focusCurrentWindow();
            } catch (e) {
              console.error("[DBX] dbx-open-db-files error:", e);
            }
          }),
        );

        track(
          listen<string[]>("dbx-open-connection-links", async (event) => {
            try {
              for (const url of event.payload) {
                await deps.openConnectionDeepLink(url);
              }
              focusCurrentWindow();
            } catch (e) {
              console.error("[DBX] dbx-open-connection-links error:", e);
            }
          }),
        );

        track(
          listen<string[]>("dbx-open-ai-config-links", async (event) => {
            try {
              for (const url of event.payload) {
                await deps.openAiConfigDeepLink(url);
              }
              focusCurrentWindow();
            } catch (e) {
              console.error("[DBX] dbx-open-ai-config-links error:", e);
            }
          }),
        );

        track(
          listen("dbx-close-active-tab", async () => {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            if (
              !(await getCurrentWindow()
                .isFocused()
                .catch(() => false))
            )
              return;
            deps.closeActiveSurface();
          }),
        );

        // A plugin was installed/rolled back from its already-replaced runtime:
        // open workbench tabs still render the previous UI bundle until they
        // reload, so hand them the new identity to pick up.
        track(
          listen<{ pluginId: string; version: string }>("plugin-runtime-replaced", (event) => {
            if (event.payload?.pluginId) deps.refreshPluginWorkbenches(event.payload.pluginId);
          }),
        );

        return Promise.allSettled(registrations).then(() => {});
      })
      .catch(() => {});
  }

  function cleanupTauriListeners() {
    unlistenHandles.forEach((unlisten) => unlisten());
    unlistenHandles.length = 0;
  }

  return { setupTauriListeners, cleanupTauriListeners };
}
