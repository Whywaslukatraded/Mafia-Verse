import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

async function bootstrap() {
  // Fetch Clerk publishable key from backend (it's public-safe to expose)
  let publishableKey = "";
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      publishableKey = data.clerkPublishableKey ?? "";
    }
  } catch {
    // server not ready yet — key stays empty
  }

  const root = createRoot(document.getElementById("root")!);

  // Always render ClerkProvider; hooks (useUser, useClerk) require it to be in tree
  if (publishableKey) {
    root.render(
      <ClerkProvider
        publishableKey={publishableKey}
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        afterSignOutUrl="/"
      >
        <App />
      </ClerkProvider>
    );
  } else {
    // Clerk not configured — render without auth (isSignedIn will be false everywhere)
    root.render(<App />);
  }
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
