import { createRoot } from "react-dom/client";
import App from "./App";
import { initSupabase } from "./lib/supabase";
import "./index.css";

async function bootstrap() {
  // Initialize Supabase from VITE_ env vars (available at build time)
  const url = import.meta.env.VITE_SUPABASE_URL || "";
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

  if (url && key) {
    initSupabase(url, key);
  } else {
    // Fallback: fetch from backend API
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        let configUrl = data.supabaseUrl ?? "";
        if (configUrl.endsWith("/rest/v1/") || configUrl.endsWith("/rest/v1")) {
          configUrl = configUrl.replace(/\/rest\/v1\/?$/, "");
        }
        const configKey = data.supabaseAnonKey ?? "";
        if (configUrl && configKey) {
          initSupabase(configUrl, configKey);
        }
      }
    } catch {
      // server not ready yet
    }
  }

  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

bootstrap();

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker registration failed:", err));
  });
}
