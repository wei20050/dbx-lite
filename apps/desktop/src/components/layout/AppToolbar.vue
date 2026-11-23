<script setup lang="ts">
import { TOOLBAR_ITEM_GROUPS, toolbarGroupOrder, orderToolbarItems } from "@/lib/settings/toolbarCustomization";
import { computed, defineAsyncComponent, ref, shallowRef, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronsRight,
  DatabaseZap,
  FilePlus2,
  FolderOpen,
  Moon,
  Sun,
  SunMoon,
  History,
  Bot,
  ArrowLeftRight,
  FileCode,
  BookMarked,
  GitCompareArrows,
  TableProperties,
  Settings,
  LogOut,
  FileDown,
  FolderTree,
  Pin,
  PinOff,
  CalendarClock,
  RefreshCw,
  AppWindow,
  PanelsTopLeft,
  ChevronsLeft,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import LightDropdown, { type LightDropdownItem } from "@/components/ui/LightDropdown.vue";
import WindowControls from "@/components/layout/WindowControls.vue";
import ExportProgressPopover from "@/components/export/ExportProgressPopover.vue";
import PluginShortcutToolbar from "@/components/plugins/PluginShortcutToolbar.vue";
import AppLogo from "@/components/icons/AppLogo.vue";
import { MAC_TRAFFIC_LIGHT_X, macTrafficLightInsetPaddingForScale, shouldReserveMacTrafficLightInset, useWindowControls } from "@/composables/useWindowControls";
import { useToast } from "@/composables/useToast";
import { useSettingsStore } from "@/stores/settingsStore";
import { isSystemAppThemeMode, type AppThemeMode } from "@/lib/app/appTheme";
import { formatShortcutTooltip } from "@/lib/editor/shortcutDisplay";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/backend/safeStorage";

const RecentClosedTabsDialog = defineAsyncComponent(() => import("@/components/tabs/RecentClosedTabsDialog.vue"));
const showRecentClosedTabs = ref(false);

const props = defineProps<{
  isDark: boolean;
  themeMode: AppThemeMode;
  workspaceWindowLabel?: string;
  workspaceWindowTargets?: Array<{ label: string; title: string }>;
  showSidebarExpand?: boolean;
  showAiPanel: boolean;
  activeAiRunCount: number;
  /** Runs awaiting a write confirmation; the badge turns amber to outrank the
   *  plain active count (parent PRD §4 line 71). */
  awaitingAiRunCount: number;
  showHistory: boolean;
  showSqlLibrary: boolean;
  sqlLibrarySaveFeedbackId: number;
  showSqlFilePanel: boolean;
  showDriverStore: boolean;
  showSettingsPage: boolean;
  hasConnections: boolean;
  hasClosedTabs?: boolean;
  canNewQuery: boolean;
  hasSqlFileConnections: boolean;
  immediateSyncing: boolean;
  showLogout?: boolean;
}>();

const emit = defineEmits<{
  "expand-sidebar": [];
  "new-connection": [];
  "new-query": [];
  "open-sql-editor-file": [];
  "set-theme-mode": [mode: AppThemeMode];
  "toggle-ai": [];
  "toggle-history": [];
  "toggle-sql-library": [];
  "toggle-sql-file-panel": [];
  "open-settings": [];
  "open-driver-store": [];
  "open-transfer": [];
  "open-sql-file": [];
  "open-schema-diff": [];
  "open-data-compare": [];
  "open-backups": [];
  "focus-workspace-window": [label: string];
  "refresh-workspace-windows": [];
  "consolidate-workspace-windows": [];
  "immediate-sync": [];
  logout: [];
}>();

const { t } = useI18n();
const { toast } = useToast();

const settingsStore = useSettingsStore();
const CONSOLIDATE_WORKSPACE_WINDOWS = "__consolidate-workspace-windows__";
const toolbarItems = computed(() => settingsStore.editorSettings.toolbarItems);
const orderedToolbarKeys = computed(() => ({
  primary: toolbarGroupOrder(settingsStore.editorSettings.toolbarItemOrder, "primary"),
  menu: toolbarGroupOrder(settingsStore.editorSettings.toolbarItemOrder, "menu"),
  right: toolbarGroupOrder(settingsStore.editorSettings.toolbarItemOrder, "right"),
  controls: toolbarGroupOrder(settingsStore.editorSettings.toolbarItemOrder, "controls"),
}));
watch(orderedToolbarKeys, resetToolbarMeasurement, { deep: true });
const webLogoPosition = computed(() => settingsStore.editorSettings.webLogoPosition ?? "left");
const { isMac, isDesktop, showControls, isMaximized, isFullscreen, isAlwaysOnTop, minimize, toggleMaximize, toggleAlwaysOnTop, close } = useWindowControls();
const workspaceWindowCaption = computed(() => {
  if (!isDesktop) return "";
  if (props.workspaceWindowLabel === "main") return t("contextMenu.mainWindow");
  if (props.workspaceWindowLabel?.startsWith("dbx-tab-") && !props.workspaceWindowLabel.startsWith("dbx-tab-drag-preview")) {
    const labels = [props.workspaceWindowLabel, ...(props.workspaceWindowTargets ?? []).map((window) => window.label)].filter((label, index, all) => label !== "main" && all.indexOf(label) === index).sort();
    return t("contextMenu.detachedWindow", { number: labels.indexOf(props.workspaceWindowLabel) + 1 });
  }
  return "";
});
const workspaceWindowMenuVisible = computed(() => {
  if (!isDesktop || !props.workspaceWindowLabel) return false;
  if (props.workspaceWindowLabel === "main" && !settingsStore.editorSettings.crossWindowTabDragPreviewEnabled) return false;
  return props.workspaceWindowLabel !== "main" || (props.workspaceWindowTargets?.length ?? 0) > 0;
});
const workspaceWindowItems = computed<LightDropdownItem[]>(() => {
  if (!props.workspaceWindowLabel) return [];
  const windows = [{ label: props.workspaceWindowLabel, title: "" }, ...(props.workspaceWindowTargets ?? [])].filter((window, index, all) => all.findIndex((candidate) => candidate.label === window.label) === index);
  const detachedLabels = windows
    .filter((window) => window.label !== "main")
    .map((window) => window.label)
    .sort();
  const items: LightDropdownItem[] = windows.map((window) => {
    const label = window.label === "main" ? t("contextMenu.mainWindow") : t("contextMenu.detachedWindow", { number: detachedLabels.indexOf(window.label) + 1 });
    return {
      label,
      value: window.label,
      title: label,
      icon: window.label === "main" ? AppWindow : PanelsTopLeft,
      disabled: window.label === props.workspaceWindowLabel,
    };
  });
  if (props.workspaceWindowLabel === "main" && detachedLabels.length > 0) {
    items.push({
      label: t("contextMenu.consolidateWorkspaceWindows"),
      value: CONSOLIDATE_WORKSPACE_WINDOWS,
      title: t("contextMenu.consolidateWorkspaceWindows"),
      icon: PanelsTopLeft,
      separatorBefore: true,
    });
  }
  return items;
});
function handleWorkspaceWindowSelection(value: string) {
  if (value === CONSOLIDATE_WORKSPACE_WINDOWS) emit("consolidate-workspace-windows");
  else emit("focus-workspace-window", value);
}
// The always-on-top control is opt-in (外观 → 工具栏): the right side of the
// toolbar is the most crowded strip in the app. It stays visible while the
// window is actually pinned even with the setting off, so turning the setting
// off can never leave the user with a pinned window and no way to unpin it.
const showAlwaysOnTopButton = computed(() => isDesktop && (toolbarItems.value.alwaysOnTop || isAlwaysOnTop.value));
const sidebarExpandTooltip = computed(() => formatShortcutTooltip(t("sidebar.expand"), settingsStore.editorSettings.shortcuts.toggleSidebar));
const newQueryTooltip = computed(() => formatShortcutTooltip(t("toolbar.newQuery"), settingsStore.editorSettings.shortcuts.newQuery));
const aiTooltip = computed(() => formatShortcutTooltip("AI", settingsStore.editorSettings.shortcuts.toggleAiPanel));
const settingsTooltip = computed(() => formatShortcutTooltip(t("settings.title"), settingsStore.editorSettings.shortcuts.openSettings));

const sqlLibrarySaveFeedbackActive = ref(false);
const SQL_LIBRARY_BOOKMARK_PATH = "M10 2 L10 10 L13 7 L16 10 L16 2";
const SQL_LIBRARY_CHECK_PATH = "M9 9.5 L9 9.5 L11 11.5 L15 7.5 L15 7.5";
type SvgAnimateElement = SVGElement & { beginElement?: () => void };
const sqlLibraryIconPathRef = shallowRef<SVGPathElement | null>(null);
const sqlLibraryMorphToCheckRef = shallowRef<SvgAnimateElement | null>(null);
const sqlLibraryMorphToBookmarkRef = shallowRef<SvgAnimateElement | null>(null);
let sqlLibrarySaveFeedbackTimer = 0;

watch(
  () => props.sqlLibrarySaveFeedbackId,
  async (id, previousId) => {
    if (id <= 0 || id === previousId) return;
    sqlLibrarySaveFeedbackActive.value = false;
    await nextTick();
    sqlLibrarySaveFeedbackActive.value = true;
    window.clearTimeout(sqlLibrarySaveFeedbackTimer);
    sqlLibrarySaveFeedbackTimer = window.setTimeout(() => {
      sqlLibrarySaveFeedbackActive.value = false;
    }, 850);
  },
);

watch(sqlLibrarySaveFeedbackActive, async (active) => {
  await nextTick();
  const path = sqlLibraryIconPathRef.value;
  const animation = active ? sqlLibraryMorphToCheckRef.value : sqlLibraryMorphToBookmarkRef.value;
  const destination = active ? SQL_LIBRARY_CHECK_PATH : SQL_LIBRARY_BOOKMARK_PATH;
  if (!path) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !animation?.beginElement) {
    path.setAttribute("d", destination);
    return;
  }
  animation.beginElement();
});

const themeTriggerIcon = computed(() => {
  if (isSystemAppThemeMode(props.themeMode)) return SunMoon;
  return props.isDark ? Moon : Sun;
});

const themeCycle: AppThemeMode[] = ["light", "dark", "system"];

function nextThemeMode(mode: AppThemeMode): AppThemeMode {
  const index = themeCycle.indexOf(mode);
  return themeCycle[(index + 1) % themeCycle.length] ?? themeCycle[0];
}

function themeModeLabel(mode: AppThemeMode): string {
  if (mode === "light") return t("toolbar.themeLight");
  if (mode === "dark") return t("toolbar.themeDark");
  return t("toolbar.themeSystem");
}

function cycleThemeMode() {
  const next = nextThemeMode(props.themeMode);
  emit("set-theme-mode", next);
  toast(`${t("toolbar.theme")}: ${themeModeLabel(next)}`, 1600);
}

function onToolbarDblClick(e: MouseEvent) {
  if (isDesktop) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, [role='button'], a")) return;
  toggleMaximize();
}

const toolbarEl = ref<HTMLElement>();
const newConnectionLabelEl = shallowRef<HTMLElement>();
const shouldReserveTrafficLightInset = computed(() => shouldReserveMacTrafficLightInset(isMac, isFullscreen.value, isDesktop));

// ──────────── Right-side overflow detection ────────────

const rightWrapper = ref<HTMLElement>();
const rightToolbarLabelsRestoreSlack = 24;
// The manual toggle is gone: labels are on by default and a narrow window
// still collapses them automatically in settleRightToolbarLabels().
const showRightToolbarLabels = ref(true);
// Keep the saved preference separate from the mode that fits the current window.
// A narrow window may temporarily hide labels without changing the preference.
const effectiveRightToolbarLabels = ref<"true" | "partial" | "false">("false");
let collapsedRightLabelCount = 0;
let toolbarLayoutRaf = 0;
let trafficLightSyncRaf = 0;
let settlingToolbarLayout = false;
let pendingToolbarSettle = false;
const toolbarLabelMeasurements = new Map<boolean, { buttons: HTMLButtonElement[]; requiredWidths: number[] }>();
let lastTrafficLightPosition = "";
let pluginToolbarSignature = "";
const measuredTrafficLightInset = ref<number | null>(null);

type MacosTrafficLightLayout = {
  x: number;
  y: number;
  center_y: number;
  previous_center_y: number;
  reserved_inset: number;
};

/** Ordered list of right-side item keys that can overflow into "More".
 *  Items earlier in the list overflow first when space shrinks. */
const collapsibleRightItemDefs = computed(() => {
  interface ItemDef {
    key: string;
    label: string;
    icon: any;
    action: () => void;
    disabled: boolean;
  }
  const items: ItemDef[] = [];
  if (toolbarItems.value.immediateSync) {
    items.push({
      key: "immediateSync",
      label: t("toolbar.immediateSync"),
      icon: RefreshCw,
      action: () => emit("immediate-sync"),
      disabled: props.immediateSyncing,
    });
  }
  if (toolbarItems.value.exportProgress !== false) {
    items.push({
      key: "exportProgress",
      label: t("exportProgress.tooltip"),
      icon: FileDown,
      action: () => {},
      disabled: false,
    });
  }
  if (toolbarItems.value.sqlLibrary) {
    items.push({
      key: "sqlLibrary",
      label: t("sqlLibrary.title"),
      icon: BookMarked,
      action: () => emit("toggle-sql-library"),
      disabled: false,
    });
  }
  if (toolbarItems.value.sqlFileTree) {
    items.push({
      key: "sqlFileTree",
      label: t("sqlFileTree.title"),
      icon: FolderTree,
      action: () => emit("toggle-sql-file-panel"),
      disabled: false,
    });
  }
  if (toolbarItems.value.history) {
    items.push({
      key: "history",
      label: t("history.title"),
      icon: History,
      action: () => emit("toggle-history"),
      disabled: false,
    });
  }
  if (toolbarItems.value.ai) {
    items.push({
      key: "ai",
      label: "AI",
      icon: Bot,
      action: () => emit("toggle-ai"),
      disabled: false,
    });
  }
  if (toolbarItems.value.theme) {
    items.push({
      key: "theme",
      label: t("toolbar.theme"),
      icon: themeTriggerIcon.value,
      action: cycleThemeMode,
      disabled: false,
    });
  }
  const order = orderedToolbarKeys.value.right;
  const unchanged = order.every((key, index) => key === TOOLBAR_ITEM_GROUPS.right[index]);
  return unchanged ? items : orderToolbarItems(items, order, (item) => item.key);
});

/**
 * Only the left-side promoted actions ever leave the toolbar: they drop into
 * "More" one at a time from the end when the row runs out of room.
 *
 * The right-side icons never collapse — at most their text labels hide (see
 * settleRightToolbarLabels), so the icon row stays reachable at any width.
 */
const hiddenInlineCount = ref(0);

function withToolbarMeasurement<T>(measure: (copy: HTMLElement) => T): T | undefined {
  const toolbar = toolbarEl.value;
  if (!toolbar?.parentElement || toolbar.clientWidth <= 0) return;
  // Cache intrinsic widths independently of the live window and animation.
  const copy = toolbar.cloneNode(true) as HTMLElement;
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  copy.dataset.toolbarMeasuring = "";
  Object.assign(copy.style, { position: "fixed", left: "-100000px", top: "0", width: "max-content", minWidth: "0", maxWidth: "none", visibility: "hidden", pointerEvents: "none" });
  toolbar.parentElement.appendChild(copy);
  try {
    return measure(copy);
  } finally {
    copy.remove();
  }
}

/**
 * True when the row no longer fits. `scrollWidth` alone misses the common case
 * where the flex row shrinks the left side but the right icon cluster (which is
 * shrink-0) simply sticks out and gets clipped by overflow-hidden, so the icon
 * row's right edge is compared against the toolbar box as well.
 */
function toolbarOverflows(toolbar: HTMLElement): boolean {
  if (toolbar.scrollWidth > toolbar.clientWidth + 1) return true;
  const wrapper = rightWrapper.value;
  if (!wrapper) return false;
  const toolbarRect = toolbar.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  return wrapperRect.right > toolbarRect.right - 1;
}

function visibleToolbarLabelButtons(toolbar: HTMLElement): HTMLButtonElement[] {
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button[data-right-toolbar-label]")).filter((button) => {
    for (let element: HTMLElement | null = button; element && element !== toolbar; element = element.parentElement) {
      if (getComputedStyle(element).display === "none") return false;
    }
    return true;
  });
}

function handlePluginToolbarLayout() {
  const signature = Array.from(toolbarEl.value?.querySelectorAll<HTMLElement>("[data-plugin-shortcut-toolbar]") ?? [])
    .map(
      (element) =>
        `${element.style.width}:${Array.from(element.querySelectorAll<HTMLElement>("[data-shortcut-id]"))
          .map((entry) => entry.dataset.shortcutId)
          .join(",")}`,
    )
    .join("|");
  if (signature === pluginToolbarSignature) return;
  pluginToolbarSignature = signature;
  resetToolbarMeasurement();
}

async function settleRightToolbarLabels() {
  const toolbar = toolbarEl.value;
  if (!toolbar || toolbar.clientWidth <= 0) return;

  let metrics = toolbarLabelMeasurements.get(false);
  if (!metrics) {
    const measured = withToolbarMeasurement((copy) => {
      const copies = visibleToolbarLabelButtons(copy);
      copies.forEach((button) => {
        button.dataset.rightToolbarLabelVisible = "true";
      });
      const widths = copies.map((button) => getComputedStyle(button, "::after").width);
      const requiredWidths: number[] = [];
      for (let collapsed = 0; collapsed <= copies.length; collapsed++) {
        copies.forEach((button, index) => {
          button.dataset.rightToolbarLabelVisible = String(index >= collapsed);
        });
        requiredWidths.push(copy.scrollWidth);
      }
      return { widths, requiredWidths };
    });
    if (!measured) return;
    const visibleButtons = new Set(visibleToolbarLabelButtons(toolbar));
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button[data-right-toolbar-label]")).filter((button) => {
      const item = button.closest<HTMLElement>("[data-toolbar-item]");
      return (item && collapsibleRightItemDefs.value.some(({ key }) => item.dataset.toolbarItem === key)) || visibleButtons.has(button);
    });
    buttons.forEach((button, index) => {
      if (measured.widths[index]) button.style.setProperty("--toolbar-label-width", measured.widths[index]);
    });
    metrics = { buttons, requiredWidths: measured.requiredWidths };
    toolbarLabelMeasurements.set(false, metrics);
  }
  const { buttons, requiredWidths } = metrics;
  let collapsed = showRightToolbarLabels.value ? 0 : buttons.length;
  for (; collapsed < buttons.length; collapsed++) {
    const slack = collapsed < collapsedRightLabelCount ? rightToolbarLabelsRestoreSlack : 0;
    if (requiredWidths[collapsed] + slack <= toolbar.clientWidth + 1) break;
  }
  collapsedRightLabelCount = collapsed;
  buttons.forEach((button, index) => {
    const visible = String(showRightToolbarLabels.value && index >= collapsed);
    if (button.dataset.rightToolbarLabelVisible !== visible) button.dataset.rightToolbarLabelVisible = visible;
  });
  effectiveRightToolbarLabels.value = !showRightToolbarLabels.value || collapsed >= buttons.length ? "false" : collapsed === 0 ? "true" : "partial";
}

/**
 * Collapse cascade, re-evaluated from the fully expanded state on every
 * resize so a stale intermediate state can never stick:
 *   1. everything visible
 *   2. right-side text labels hide (icons never move)
 *   3. promoted left actions drop one by one, from the end
 */
async function settleToolbarOverflow() {
  if (settlingToolbarLayout) {
    pendingToolbarSettle = true;
    return;
  }

  settlingToolbarLayout = true;
  try {
    do {
      pendingToolbarSettle = false;
      const toolbar = toolbarEl.value;
      if (!toolbar || toolbar.clientWidth <= 0) break;

      const totalInline = inlineActions.value.length;
      hiddenInlineCount.value = 0;
      await nextTick();

      // Labels shrink first (icons always stay), then left actions leave for
      // "More" one by one.
      await settleRightToolbarLabels();
      await nextTick();

      while (hiddenInlineCount.value < totalInline && toolbarOverflows(toolbar)) {
        hiddenInlineCount.value += 1;
        await nextTick();
      }
    } while (pendingToolbarSettle);
  } finally {
    settlingToolbarLayout = false;
  }
}

function scheduleToolbarLayout() {
  if (toolbarLayoutRaf) return;
  toolbarLayoutRaf = requestAnimationFrame(() => {
    toolbarLayoutRaf = 0;
    void settleToolbarOverflow();
  });
}

function scheduleTrafficLightSync() {
  if (!shouldReserveTrafficLightInset.value) return;
  if (trafficLightSyncRaf) cancelAnimationFrame(trafficLightSyncRaf);
  trafficLightSyncRaf = requestAnimationFrame(() => {
    trafficLightSyncRaf = 0;
    void syncTrafficLightsToToolbar();
  });
}

async function syncTrafficLightsToToolbar() {
  if (!shouldReserveTrafficLightInset.value) return;
  const toolbarRect = toolbarEl.value?.getBoundingClientRect();
  const targetEl = newConnectionLabelEl.value;
  const targetRect = targetEl?.getBoundingClientRect();
  if (!toolbarRect || !targetRect) return;
  const targetCenterY = targetRect.top - toolbarRect.top + targetRect.height / 2;
  const positionKey = `${targetCenterY}:${settingsStore.editorSettings.uiScale}`;
  if (lastTrafficLightPosition === positionKey) return;
  lastTrafficLightPosition = positionKey;
  try {
    const layout = await invoke<MacosTrafficLightLayout>("set_macos_traffic_light_position", {
      x: MAC_TRAFFIC_LIGHT_X,
      y: targetCenterY,
      scale: settingsStore.editorSettings.uiScale,
    });
    measuredTrafficLightInset.value = Math.ceil(layout.reserved_inset / settingsStore.editorSettings.uiScale);
  } catch (error) {
    lastTrafficLightPosition = "";
    console.warn("[DBX] Failed to sync macOS traffic light position", { targetCenterY, error });
  }
}

function handleWindowResize() {
  scheduleToolbarLayout();
}

function resetRightToolbarMeasurement() {
  toolbarLabelMeasurements.clear();
  collapsedRightLabelCount = 0;
  scheduleToolbarLayout();
}
function resetToolbarMeasurement() {
  resetRightToolbarMeasurement();
  scheduleTrafficLightSync();
}
watch(measuredTrafficLightInset, resetRightToolbarMeasurement);
watch(collapsibleRightItemDefs, resetToolbarMeasurement, { flush: "post" });
watch(toolbarItems, resetToolbarMeasurement, { deep: true, flush: "post" });
watch(() => [workspaceWindowMenuVisible.value, workspaceWindowCaption.value, props.showLogout, showAlwaysOnTopButton.value, isAlwaysOnTop.value, props.canNewQuery, props.hasClosedTabs], resetToolbarMeasurement, { flush: "post" });
watch(
  showRightToolbarLabels,
  (show) => {
    safeLocalStorageSet(rightToolbarLabelsKey, String(show));
    collapsedRightLabelCount = 0;
    scheduleToolbarLayout();
  },
  { flush: "post" },
);
watch(() => settingsStore.editorSettings.webLogoPosition, resetToolbarMeasurement, { flush: "post" });
watch(() => props.showSidebarExpand, resetToolbarMeasurement, { flush: "post" });
watch(() => settingsStore.editorSettings.uiFontFamily, resetToolbarMeasurement, { flush: "post" });
watch(
  () => settingsStore.editorSettings.uiScale,
  () => {
    measuredTrafficLightInset.value = null;
    resetToolbarMeasurement();
    window.setTimeout(scheduleTrafficLightSync, 120);
  },
);
watch(shouldReserveTrafficLightInset, () => {
  lastTrafficLightPosition = "";
  resetToolbarMeasurement();
});

// ──────────── Resize observer ────────────

let resizeObserver: ResizeObserver | null = null;
let toolbarContentObserver: MutationObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(scheduleToolbarLayout);
  if (toolbarEl.value) resizeObserver.observe(toolbarEl.value);
  if (rightWrapper.value) {
    toolbarContentObserver = new MutationObserver(resetToolbarMeasurement);
    toolbarContentObserver.observe(rightWrapper.value, { childList: true, subtree: true });
  }
  document.fonts?.addEventListener("loadingdone", resetToolbarMeasurement);
  window.addEventListener("resize", handleWindowResize);
  scheduleToolbarLayout();
  scheduleTrafficLightSync();
});

onBeforeUnmount(() => {
  if (toolbarLayoutRaf) cancelAnimationFrame(toolbarLayoutRaf);
  if (trafficLightSyncRaf) cancelAnimationFrame(trafficLightSyncRaf);
  window.clearTimeout(sqlLibrarySaveFeedbackTimer);
  resizeObserver?.disconnect();
  toolbarContentObserver?.disconnect();
  document.fonts?.removeEventListener("loadingdone", resetToolbarMeasurement);
  window.removeEventListener("resize", handleWindowResize);
});

// ──────────── Left-side "More" items ────────────

type ToolbarMenuItem = LightDropdownItem & { action: () => void };

const toolbarMenuItemKeys: Record<string, string> = {
  "open-sql-editor-file": "openSql",
  transfer: "dataTransfer",
  "sql-file": "sqlFile",
  "schema-diff": "schemaDiff",
  "data-compare": "dataCompare",
  "database-backups": "databaseBackups",
  "new-connection": "newConnection",
  "new-query": "newQuery",
  settings: "settings",
  logout: "logout",
};
function toolbarMenuItemKey(item: ToolbarMenuItem): string {
  return toolbarMenuItemKeys[item.value] ?? item.value;
}

/**
 * Actions promoted out of "More" onto the toolbar. They drop back into the
 * dropdown one by one (from the end) only when the toolbar runs out of room.
 */
const inlineActions = computed<ToolbarMenuItem[]>(() => {
  const items: ToolbarMenuItem[] = [];
  if (toolbarItems.value.openSql !== false) {
    items.push({ value: "open-sql-editor-file", label: t("toolbar.openSql"), icon: FolderOpen, action: () => emit("open-sql-editor-file"), disabled: false });
  }
  if (toolbarItems.value.sqlFile) {
    items.push({ value: "sql-file", label: t("sqlFile.title"), icon: FileCode, action: () => emit("open-sql-file"), disabled: !props.hasSqlFileConnections });
  }
  if (toolbarItems.value.schemaDiff) {
    items.push({ value: "schema-diff", label: t("diff.title"), icon: GitCompareArrows, action: () => emit("open-schema-diff"), disabled: !props.hasConnections });
  }
  if (toolbarItems.value.dataCompare) {
    items.push({ value: "data-compare", label: t("dataCompare.title"), icon: TableProperties, action: () => emit("open-data-compare"), disabled: !props.hasConnections });
  }
  if (toolbarItems.value.databaseBackups !== false) {
    items.push({ value: "database-backups", label: t("databaseBackup.title"), icon: CalendarClock, action: () => emit("open-backups"), disabled: false });
  }
  // Sits last so it collapses into "More" before the primary actions do.
  if (props.hasClosedTabs) {
    items.push({ value: "recent-closed-tabs", label: t("tabs.recentClosedTitle"), icon: History, action: () => (showRecentClosedTabs.value = true) });
  }
  return items;
});

/** Actions still rendered on the toolbar (in order). */
const visibleInlineActions = computed(() => inlineActions.value.slice(0, Math.max(0, inlineActions.value.length - hiddenInlineCount.value)));

/** Actions that were pushed into "More" because the toolbar ran out of room. */
const hiddenInlineActions = computed(() => inlineActions.value.slice(visibleInlineActions.value.length));

const moreItems = computed<ToolbarMenuItem[]>(() => {
  const items: ToolbarMenuItem[] = [];

  // Left side: whatever had to leave the toolbar.
  for (const item of hiddenInlineActions.value) {
    items.push({ value: item.value, label: item.label, icon: item.icon, action: item.action, disabled: item.disabled });
  }
  if (toolbarItems.value.dataTransfer === false) {
    items.push({ value: "transfer", label: t("transfer.dataTransfer"), icon: ArrowLeftRight, action: () => emit("open-transfer"), disabled: !props.hasConnections });
  }

  // Actions the user turned off in settings always live here.
  if (toolbarItems.value.newConnection === false) items.push({ value: "new-connection", label: t("toolbar.newConnection"), icon: DatabaseZap, action: () => emit("new-connection"), disabled: false });
  if (toolbarItems.value.newQuery === false && props.canNewQuery) items.push({ value: "new-query", label: t("toolbar.newQuery"), icon: FilePlus2, action: () => emit("new-query"), disabled: false });
  if (toolbarItems.value.settings === false) items.push({ value: "settings", label: t("settings.title"), icon: Settings, action: () => emit("open-settings"), disabled: false });
  if (toolbarItems.value.logout === false && props.showLogout) items.push({ value: "logout", label: t("auth.logout"), icon: LogOut, action: () => emit("logout"), disabled: false });

  const orderedMenu = orderToolbarItems(items, orderedToolbarKeys.value.menu, toolbarMenuItemKey);
  const orderedPrimary = orderToolbarItems(orderedMenu, orderedToolbarKeys.value.primary, toolbarMenuItemKey);
  return orderToolbarItems(orderedPrimary, orderedToolbarKeys.value.controls, toolbarMenuItemKey);
});

const showMoreDropdown = computed(() => moreItems.value.length > 0);

function runMoreItem(value: string) {
  const item = moreItems.value.find((i) => i.value === value);
  item?.action();
}

const toolbarTextButtonClass = "h-8 px-2 text-xs gap-1 leading-none";
const toolbarTextLabelClass = "inline-flex translate-y-px items-center leading-none";
const toolbarDropdownTriggerClass = `app-toolbar-more inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-2 text-xs font-medium leading-none hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 transition-colors [&>span:first-child]:translate-y-px [&>svg]:shrink-0`;
const toolbarStyle = computed(() => {
  if (!shouldReserveTrafficLightInset.value) return undefined;
  return {
    paddingLeft: `${measuredTrafficLightInset.value ?? parseInt(macTrafficLightInsetPaddingForScale(settingsStore.editorSettings.uiScale), 10)}px`,
  };
});

function setNewConnectionLabelEl(el: unknown): void {
  newConnectionLabelEl.value = (el as HTMLElement | null) ?? undefined;
}
function setSqlLibraryIconPathRef(el: unknown): void {
  sqlLibraryIconPathRef.value = el as SVGPathElement | null;
}
function setSqlLibraryMorphToCheckRef(el: unknown): void {
  sqlLibraryMorphToCheckRef.value = el as SvgAnimateElement | null;
}
function setSqlLibraryMorphToBookmarkRef(el: unknown): void {
  sqlLibraryMorphToBookmarkRef.value = el as SvgAnimateElement | null;
}
</script>

<template>
  <div ref="toolbarEl" class="app-toolbar h-10 flex items-center gap-1 px-2 border-b bg-muted/30 shrink-0 overflow-hidden" :style="toolbarStyle" :data-right-toolbar-labels="effectiveRightToolbarLabels" data-tauri-drag-region @dblclick="onToolbarDblClick">
    <div v-if="!isDesktop && webLogoPosition === 'left'" class="flex items-center gap-1.5 h-8 px-2 rounded-md shrink-0 select-none mr-0.5" title="dbx-lite" data-testid="web-brand-logo">
      <AppLogo class="h-5 w-5 rounded shrink-0 pointer-events-none" />
      <span class="font-bold text-xs tracking-tight text-foreground/90 translate-y-px">dbx-lite</span>
    </div>
    <Tooltip v-if="showSidebarExpand">
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="toolbar-action-button h-8 w-8 shrink-0" :aria-label="t('sidebar.expand')" @click="emit('expand-sidebar')">
          <ChevronsRight class="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ sidebarExpandTooltip }}</TooltipContent>
    </Tooltip>
    <template v-for="toolbarKey in orderedToolbarKeys.primary" :key="toolbarKey">
      <Button data-toolbar-item="newConnection" v-if="toolbarKey === 'newConnection' && toolbarItems.newConnection !== false" variant="ghost" size="sm" :class="toolbarTextButtonClass" @click="emit('new-connection')">
        <span class="inline-flex items-center gap-1">
          <DatabaseZap class="h-3.5 w-3.5" />
          <span :ref="setNewConnectionLabelEl" :class="toolbarTextLabelClass">{{ t("toolbar.newConnection") }}</span>
        </span>
      </Button>
      <Tooltip v-if="toolbarKey === 'newQuery' && toolbarItems.newQuery !== false && canNewQuery">
        <TooltipTrigger as-child>
          <Button data-toolbar-item="newQuery" variant="ghost" size="sm" :class="toolbarTextButtonClass" @click="emit('new-query')">
            <FilePlus2 class="h-3.5 w-3.5" />
            <span :class="toolbarTextLabelClass">{{ t("toolbar.newQuery") }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ newQueryTooltip }}</TooltipContent>
      </Tooltip>
      <Button data-toolbar-item="dataTransfer" v-if="toolbarKey === 'dataTransfer' && toolbarItems.dataTransfer" variant="ghost" size="sm" :class="toolbarTextButtonClass" @click="emit('open-transfer')" :disabled="!hasConnections">
        <ArrowLeftRight class="h-3.5 w-3.5" />
        <span :class="toolbarTextLabelClass">{{ t("transfer.dataTransfer") }}</span>
      </Button>
    </template>
    <!-- Promoted actions: always visible until the toolbar runs out of room,
         then they drop into "More" one at a time (from the end). -->
    <Button v-for="item in visibleInlineActions" :key="item.value" variant="ghost" size="sm" :class="toolbarTextButtonClass" :disabled="item.disabled" :data-toolbar-inline="item.value" @click="item.action()">
      <component :is="item.icon" class="h-3.5 w-3.5" />
      <span :class="toolbarTextLabelClass">{{ item.label }}</span>
    </Button>
    <LightDropdown
      v-if="showMoreDropdown"
      model-value=""
      :items="moreItems"
      :aria-label="t('common.more')"
      :trigger-label="t('common.more')"
      :trigger-class="toolbarDropdownTriggerClass"
      :show-trigger-label="true"
      :show-chevron="true"
      check-position="none"
      align="start"
      @update:model-value="runMoreItem($event)"
    />

    <div class="flex flex-1 items-center justify-center px-1" :class="workspaceWindowMenuVisible ? 'min-w-max' : 'min-w-0'" data-toolbar-workspace-spacer data-tauri-drag-region>
      <span v-if="workspaceWindowMenuVisible" class="shrink-0 whitespace-nowrap" data-workspace-window-identity data-workspace-window-menu @click="emit('refresh-workspace-windows')">
        <LightDropdown
          :model-value="workspaceWindowLabel ?? ''"
          :items="workspaceWindowItems"
          :aria-label="workspaceWindowCaption"
          :trigger-title="workspaceWindowCaption"
          :trigger-label="workspaceWindowCaption"
          trigger-class="flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          :trigger-icon="PanelsTopLeft"
          :show-trigger-label="true"
          :show-chevron="true"
          check-position="none"
          :match-trigger-width="false"
          @update:model-value="handleWorkspaceWindowSelection"
        />
      </span>
    </div>

    <!-- Right-side items wrapped in overflow-aware container -->
    <!-- shrink-0: the icon row must never be squeezed. When space runs out the
         labels hide first, then the left-side actions move into "More"; the
         icons themselves always stay fully visible. -->
    <div ref="rightWrapper" data-toolbar-right-actions class="flex shrink-0 items-center gap-0.5">
      <PluginShortcutToolbar v-if="settingsStore.editorSettings.pluginShortcuts.enabled && settingsStore.editorSettings.pluginShortcuts.position === 'toolbar'" @layout-change="handlePluginToolbarLayout" /><template v-for="toolbarKey in orderedToolbarKeys.right" :key="toolbarKey">
        <Tooltip v-if="toolbarKey === 'immediateSync' && toolbarItems.immediateSync">
          <TooltipTrigger as-child>
            <Button
              data-toolbar-item="immediateSync"
              variant="ghost"
              size="icon"
              class="toolbar-action-button h-8 w-8 shrink-0"
              :aria-label="t('toolbar.immediateSync')"
              :data-right-toolbar-label="t('toolbar.immediateSync')"
              :aria-busy="immediateSyncing"
              :disabled="immediateSyncing"
              @click="emit('immediate-sync')"
            >
              <RefreshCw class="toolbar-action-icon h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t("toolbar.immediateSync") }}</TooltipContent>
        </Tooltip>
        <Tooltip v-if="toolbarKey === 'alwaysOnTop' && showAlwaysOnTopButton">
          <TooltipTrigger as-child>
            <Button
              data-toolbar-item="alwaysOnTop"
              variant="ghost"
              size="icon"
              class="toolbar-action-button relative h-8 w-8 shrink-0"
              :class="{ 'toolbar-action-button--active bg-accent': isAlwaysOnTop }"
              :aria-pressed="isAlwaysOnTop"
              :aria-label="isAlwaysOnTop ? t('toolbar.alwaysOnTopOff') : t('toolbar.alwaysOnTop')"
              :data-right-toolbar-label="isAlwaysOnTop ? t('toolbar.alwaysOnTopOff') : t('toolbar.alwaysOnTop')"
              @click="toggleAlwaysOnTop"
            >
              <Pin v-if="isAlwaysOnTop" class="toolbar-action-icon h-4 w-4 fill-current" />
              <PinOff v-else class="toolbar-action-icon h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ isAlwaysOnTop ? t("toolbar.alwaysOnTopOff") : t("toolbar.alwaysOnTop") }}</TooltipContent>
        </Tooltip>
        <div data-toolbar-item="exportProgress" v-if="toolbarKey === 'exportProgress' && toolbarItems.exportProgress !== false" class="contents">
          <ExportProgressPopover />
        </div>
        <Tooltip v-if="toolbarKey === 'sqlLibrary' && toolbarItems.sqlLibrary">
          <TooltipTrigger as-child>
            <Button
              data-toolbar-item="sqlLibrary"
              data-sql-library-trigger
              :data-right-toolbar-label="t('sqlLibrary.title')"
              :aria-label="t('sqlLibrary.title')"
              variant="ghost"
              size="icon"
              class="toolbar-action-button relative h-8 w-8 shrink-0"
              :class="{ 'toolbar-action-button--active bg-accent': showSqlLibrary, 'sql-library-save-feedback': sqlLibrarySaveFeedbackActive }"
              @click="emit('toggle-sql-library')"
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="sql-library-icon toolbar-action-icon h-4 w-4"
                :class="{ 'toolbar-action-icon--active': showSqlLibrary, 'sql-library-save-feedback-icon text-primary': sqlLibrarySaveFeedbackActive }"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
                <path :ref="setSqlLibraryIconPathRef" :d="SQL_LIBRARY_BOOKMARK_PATH">
                  <animate :ref="setSqlLibraryMorphToCheckRef" attributeName="d" :values="`${SQL_LIBRARY_BOOKMARK_PATH};${SQL_LIBRARY_CHECK_PATH}`" dur="180ms" begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" />
                  <animate :ref="setSqlLibraryMorphToBookmarkRef" attributeName="d" :values="`${SQL_LIBRARY_CHECK_PATH};${SQL_LIBRARY_BOOKMARK_PATH}`" dur="180ms" begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" />
                </path>
              </svg>
              <span v-if="showSqlLibrary" class="toolbar-panel-status" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t("sqlLibrary.title") }}</TooltipContent>
        </Tooltip>
        <Tooltip v-if="toolbarKey === 'sqlFileTree' && toolbarItems.sqlFileTree">
          <TooltipTrigger as-child>
            <Button
              data-toolbar-item="sqlFileTree"
              variant="ghost"
              size="icon"
              class="toolbar-action-button relative h-8 w-8 shrink-0"
              :class="{ 'toolbar-action-button--active bg-accent': showSqlFilePanel }"
              :data-right-toolbar-label="t('sqlFileTree.title')"
              :aria-label="t('sqlFileTree.title')"
              @click="emit('toggle-sql-file-panel')"
            >
              <FolderTree class="toolbar-action-icon h-4 w-4" :class="{ 'toolbar-action-icon--active': showSqlFilePanel }" />
              <span v-if="showSqlFilePanel" class="toolbar-panel-status" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t("sqlFileTree.title") }}</TooltipContent>
        </Tooltip>
        <Tooltip v-if="toolbarKey === 'history' && toolbarItems.history">
          <TooltipTrigger as-child>
            <Button
              data-toolbar-item="history"
              variant="ghost"
              size="icon"
              class="toolbar-action-button relative h-8 w-8 shrink-0"
              :class="{ 'toolbar-action-button--active bg-accent': showHistory }"
              :data-right-toolbar-label="t('history.title')"
              :aria-label="t('history.title')"
              @click="emit('toggle-history')"
            >
              <History class="toolbar-action-icon h-4 w-4" :class="{ 'toolbar-action-icon--active': showHistory }" />
              <span v-if="showHistory" class="toolbar-panel-status" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t("history.title") }}</TooltipContent>
        </Tooltip>
        <Tooltip v-if="toolbarKey === 'ai' && toolbarItems.ai">
          <TooltipTrigger as-child>
            <Button data-toolbar-item="ai" variant="ghost" size="icon" class="toolbar-action-button relative h-8 w-8 shrink-0" :class="{ 'toolbar-action-button--active bg-accent': showAiPanel }" data-right-toolbar-label="AI" :aria-label="aiTooltip" @click="emit('toggle-ai')">
              <Bot class="toolbar-action-icon h-4 w-4" :class="{ 'toolbar-action-icon--active': showAiPanel }" />
              <span
                v-if="awaitingAiRunCount > 0"
                class="absolute right-0.5 top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-semibold leading-none text-white"
                :aria-label="t('ai.toolbarAwaitingConfirmation', { count: awaitingAiRunCount })"
                :title="t('ai.toolbarAwaitingConfirmation', { count: awaitingAiRunCount })"
              >
                {{ awaitingAiRunCount > 9 ? "9+" : awaitingAiRunCount }}
              </span>
              <span v-else-if="activeAiRunCount > 0" class="absolute right-0.5 top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-semibold leading-none text-primary-foreground">
                {{ activeAiRunCount > 9 ? "9+" : activeAiRunCount }}
              </span>
              <span v-if="showAiPanel" class="toolbar-panel-status" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ aiTooltip }}</TooltipContent>
        </Tooltip>
        <Tooltip v-if="toolbarKey === 'theme' && toolbarItems.theme">
          <TooltipTrigger as-child>
            <Button data-toolbar-item="theme" variant="ghost" size="icon" class="toolbar-action-button h-8 w-8 shrink-0" :aria-label="t('toolbar.theme')" :data-right-toolbar-label="t('toolbar.theme')" @click="cycleThemeMode">
              <component :is="themeTriggerIcon" :key="themeMode" class="toolbar-action-icon toolbar-theme-icon h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t("toolbar.theme") }}</TooltipContent>
        </Tooltip></template
      >
    </div>
    <!-- /rightWrapper -->
    <div v-if="!isDesktop && webLogoPosition === 'right'" class="flex items-center gap-1.5 h-8 px-2 rounded-md shrink-0 select-none" title="dbx-lite" data-testid="web-brand-logo">
      <AppLogo class="h-5 w-5 rounded shrink-0 pointer-events-none" />
      <span class="font-bold text-xs tracking-tight text-foreground/90 translate-y-px">dbx-lite</span>
    </div>

    <template v-for="toolbarKey in orderedToolbarKeys.controls" :key="toolbarKey"
      ><Tooltip v-if="toolbarKey === 'settings' && toolbarItems.settings !== false">
        <TooltipTrigger as-child>
          <Button
            data-toolbar-item="settings"
            variant="ghost"
            size="icon"
            class="toolbar-action-button relative h-8 w-8 shrink-0"
            :class="{ 'toolbar-action-button--active bg-accent': showSettingsPage }"
            :data-right-toolbar-label="t('settings.title')"
            :aria-label="t('settings.title')"
            @click="emit('open-settings')"
          >
            <Settings class="toolbar-action-icon h-4 w-4" :class="{ 'toolbar-action-icon--active': showSettingsPage }" />
            <span v-if="showSettingsPage" class="toolbar-panel-status" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ settingsTooltip }}</TooltipContent>
      </Tooltip>
      <Tooltip v-if="toolbarKey === 'logout' && toolbarItems.logout !== false && showLogout">
        <TooltipTrigger as-child>
          <Button data-toolbar-item="logout" variant="ghost" size="icon" class="toolbar-action-button h-8 w-8 shrink-0" :aria-label="t('auth.logout')" :data-right-toolbar-label="t('auth.logout')" @click="emit('logout')">
            <LogOut class="toolbar-action-icon h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t("auth.logout") }}</TooltipContent>
      </Tooltip></template
    >

    <WindowControls v-if="showControls" :is-maximized="isMaximized" @minimize="minimize" @toggle-maximize="toggleMaximize" @close="close" />
    <RecentClosedTabsDialog v-if="showRecentClosedTabs" v-model:open="showRecentClosedTabs" />
  </div>
</template>

<style scoped>
.app-toolbar :deep(button[data-right-toolbar-label]) {
  width: auto;
  min-width: 2rem;
  flex-shrink: 0;
  gap: 0;
  padding-inline: 0.375rem;
}

.app-toolbar :deep(button[data-right-toolbar-label]::after) {
  content: attr(data-right-toolbar-label);
  display: block;
  min-width: 0;
  max-width: 0;
  overflow: hidden;
  font-size: 0.75rem;
  white-space: nowrap;
  opacity: 0;
  margin-left: 0;
  transition:
    max-width 160ms ease,
    margin-left 160ms ease,
    opacity 120ms ease;
}

.app-toolbar :deep(button[data-right-toolbar-label-visible="true"]::after) {
  max-width: var(--toolbar-label-width, 24rem);
  margin-left: 0.25rem;
  opacity: 1;
}

.app-toolbar[data-toolbar-measuring] :deep(button[data-right-toolbar-label]::after) {
  transition: none;
}

.app-toolbar[data-toolbar-measuring] :deep(button[data-right-toolbar-label-visible="true"]::after) {
  max-width: none;
}

.toolbar-action-icon {
  transform: translateY(0) scale(1);
  transition:
    color 180ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.toolbar-action-button:active:not(:disabled) .toolbar-action-icon,
.toolbar-action-button:active:not(:disabled) :deep([data-toolbar-update-icon]) {
  transform: scale(0.82);
}

.toolbar-action-icon--active {
  color: var(--primary);
  transform: translateY(-1px) scale(1.06);
}

.toolbar-panel-status {
  position: absolute;
  bottom: 3px;
  left: 50%;
  width: 3px;
  height: 3px;
  border-radius: 9999px;
  background: var(--primary);
  transform: translateX(-50%);
  animation: toolbar-panel-status-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.toolbar-theme-icon {
  animation: toolbar-theme-icon-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes toolbar-panel-status-in {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(2px) scale(0);
  }
  70% {
    transform: translateX(-50%) translateY(0) scale(1.3);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

@keyframes toolbar-theme-icon-in {
  0% {
    opacity: 0;
    transform: rotate(-18deg) scale(0.72);
  }
  100% {
    opacity: 1;
    transform: rotate(0) scale(1);
  }
}

@keyframes sql-library-save-confirm-button {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  36% {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--primary) 38%, transparent),
      0 0 0 3px color-mix(in srgb, var(--primary) 8%, transparent);
  }
}

@keyframes sql-library-save-confirm-icon {
  0% {
    opacity: 0.75;
    transform: scale(0.92);
  }
  38% {
    opacity: 1;
    transform: translateY(-1px) scale(1.12);
  }
  68% {
    transform: scale(0.98);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.sql-library-save-feedback {
  animation: sql-library-save-confirm-button 760ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sql-library-icon {
  transition: color 180ms ease;
}

.sql-library-save-feedback-icon {
  animation: sql-library-save-confirm-icon 760ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .app-toolbar :deep(button[data-right-toolbar-label]::after) {
    transition: none;
  }

  .toolbar-action-icon,
  .toolbar-panel-status,
  .toolbar-theme-icon {
    animation: none;
    transition: none;
  }

  .sql-library-save-feedback,
  .sql-library-save-feedback-icon {
    animation: none;
  }

  .sql-library-icon {
    transition: none;
  }
}
</style>
