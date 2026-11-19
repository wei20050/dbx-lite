import type { GlobalNavigationEntry } from "./navigationEntry";

export interface GlobalNavigationExecutorHandlers {
  restoreQuery: (entry: GlobalNavigationEntry) => Promise<boolean>;
  activateSettings: () => void;
}

export async function restoreGlobalNavigationEntry(entry: GlobalNavigationEntry, handlers: GlobalNavigationExecutorHandlers): Promise<boolean> {
  switch (entry.surface) {
    case "query":
      return handlers.restoreQuery(entry);
    case "settings":
      handlers.activateSettings();
      return true;
    default:
      return false;
  }
}
