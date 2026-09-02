import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import ptBR from "./locales/pt-BR.json";

// Feature: Spanish language option (i18n)
// Detects saved preference (localStorage key "mafia_lang") or browser language,
// falls back to English. Settings page lets the user switch languages manually.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
      "pt-BR": { translation: ptBR },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es", "fr", "zh-CN", "zh-TW", "pt-BR"],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "mafia_lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
