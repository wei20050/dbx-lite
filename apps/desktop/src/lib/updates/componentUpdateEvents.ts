export const COMPONENT_PLUGINS_UPDATED_EVENT = "dbx:component-plugins-updated";

export function notifyComponentPluginsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPONENT_PLUGINS_UPDATED_EVENT));
}
