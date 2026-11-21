import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh.json";

/**
 * Baker Writing Studio ships a Chinese-only UI.
 *
 * The original Read2MD Studio had a `中文 / English` toggle in the
 * toolbar. That toggle used to double as a UI-locale switch and a
 * Markdown-translation trigger, which made it ambiguous ("did I
 * just switch the chrome, or rewrite my document?"). The toggle is
 * gone: the UI language is pinned to Chinese here, and Markdown
 * translation is a separate, explicit action (see the `翻译` button
 * in the Preview pane header).
 *
 * The English locale bundle was removed along with the toggle: it was
 * never activated at runtime, and keeping it in the tree only invited
 * the UI to drift into a half-translated state.
 */

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
  },
  lng: "zh",
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false,
  },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = "zh-CN";
}

/** The UI is Chinese-only; kept for call sites that need the value. */
export function getAppLanguage(): "zh" {
  return "zh";
}

export default i18n;