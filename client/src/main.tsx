import { createRoot } from "react-dom/client";
import App from "./App";
import { initSupabase } from "./lib/supabase";
import "./lib/i18n";
import "./index.css";

async function bootstrap() {
  // Fetch Supabase config from backend (anon key is public-safe)
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      let url = data.supabaseUrl ?? "";
      // Strip /rest/v1 suffix if present
      if (url.endsWith("/rest/v1/") || url.endsWith("/rest/v1")) {
        url = url.replace(/\/rest\/v1\/?$/, "");
      }
      const key = data.supabaseAnonKey ?? "";
      if (url && key) {
        initSupabase(url, key);
      }
    }
  } catch {
    // server not ready yet
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
