import type { InstalledPlugin } from "@/types/database";

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(value)?.slice(1).map(Number);
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export const CC_SWITCH_PLUGIN_ID = "cc-switch";
export const CC_SWITCH_PLUGIN_CAPABILITY = "ai-config-import";
export const MAGPIE_IMPORT_MINIMUM_PLUGIN_VERSION = "0.2.2";

export type CcSwitchPluginStatus = "available" | "incompatible" | "not-installed";

export function getCcSwitchPluginStatus(plugins: readonly InstalledPlugin[]): CcSwitchPluginStatus {
  const plugin = plugins.find((item) => item.manifest.id === CC_SWITCH_PLUGIN_ID);
  if (!plugin) return "not-installed";
  if (!plugin.compatibility.compatible || !plugin.manifest.capabilities?.some((capability) => capability.id === CC_SWITCH_PLUGIN_CAPABILITY)) {
    return "incompatible";
  }
  return "available";
}

export function isCcSwitchPluginAvailable(plugins: readonly InstalledPlugin[]): boolean {
  return getCcSwitchPluginStatus(plugins) === "available";
}

export function isMagpieImportAvailable(plugins: readonly InstalledPlugin[]): boolean {
  const plugin = plugins.find((item) => item.manifest.id === CC_SWITCH_PLUGIN_ID);
  if (!plugin || getCcSwitchPluginStatus(plugins) !== "available") return false;
  return compareVersions(plugin.manifest.version || "0.0.0", MAGPIE_IMPORT_MINIMUM_PLUGIN_VERSION) >= 0;
}
