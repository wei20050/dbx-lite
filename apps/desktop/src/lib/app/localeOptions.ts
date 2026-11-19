import type { Locale } from "@/i18n";

export interface LocaleOption {
  value: Locale;
  flag: string;
  // Bundled SVGs avoid depending on system support for flag emoji (notably on Windows).
  flagIcon?: string;
  label: string;
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { value: "en", flag: "🇺🇸", flagIcon: "us", label: "English" },
  { value: "zh-CN", flag: "🇨🇳", flagIcon: "cn", label: "简体中文" },
];
