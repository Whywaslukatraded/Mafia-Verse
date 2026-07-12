import { createRoot } from "react-dom/client";
import App from "./App";
import { initSupabase } from "./lib/supabase";
import "./index.css";

// TEMPORARY: show uncaught errors directly on screen so they're visible on
// phones where we can't open a dev console. Remove this block once the
// phone crash is fixed.
function showErrorOnScreen(message: string) {
  const existing = document.getElementById("debug-error-overlay");
  if (existing) {
    existing.textContent += "\n\n" + message;
    return;
  }
  const el = document.createElement("div");
  el.id = "debug-error-overlay";
  el.style.position = "fixed";
  el.style.top = "0";
  el.style.left = "0";
  el.style.right = "0";
  el.style.zIndex = "999999";
  el.style.background = "#ff0000";
  el.style.color = "#ffffff";
  el.style.padding = "12px";
  el.style.fontSize = "12px";
  el.style.fontFamily = "monospace";
  el.style.whiteSpace = "pre-wrap";
  el.style.maxHeight = "80vh";
  el.style.overflow = "auto";
  el.textContent = message;
  document.body.appendChild(el);
}

window.addEventListener("error", (event) => {
  showErrorOnScreen(
    `ERROR: ${event.message}\nFile: ${event.filename}:${event.lineno}:${event.colno}\nStack: ${event.error?.stack || "n/a"}`
  );
});

window.addEventListener("unhandledrejection", (event) => {
  showErrorOnScreen(
    `UNHANDLED PROMISE REJECTION: ${event.reason?.message || event.reason}\nStack: ${event.reason?.stack || "n/a"}`
  );
});

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
