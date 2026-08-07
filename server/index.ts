import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { testConnection, runMigrations } from "./db";

const app = express();
// Render sits behind a proxy — without this, req.ip would always be Render's
// internal address instead of the actual visitor's IP.
app.set("trust proxy", 1);
const httpServer = createServer(app);

// Global crash protection: don't let unhandled errors kill the dev server
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  // In production this would need a restart; in dev we log and continue
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Stripe webhook MUST use raw body and be registered BEFORE express.json()
import { WebhookHandlers } from "./webhookHandlers";
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing signature" });
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("Webhook error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Security fix (#10): the app previously shipped with no security headers at
// all (X-Powered-By left on, no CSP/frame protection/HSTS/etc). Hand-rolled
// here instead of adding the `helmet` dependency, per the "don't add
// dependencies unless necessary" instruction — this app's needs are simple
// enough not to need it.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS only makes sense over HTTPS (Render terminates TLS in front of
  // this app, so req.secure/x-forwarded-proto reflects the real scheme).
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // A single restrictive-but-functional CSP: scripts/styles from self only
  // (plus the QR code generator img source used by TwoFactorSetup.tsx),
  // frame-ancestors 'none' as the modern replacement/backup for X-Frame-Options.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https://api.qrserver.com; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'"
  );
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Route prefixes whose response bodies should never be logged at all —
// these can carry TOTP secrets, QR payloads, tokens, or other secrets even
// on a successful (2xx) response.
const NEVER_LOG_BODY_PREFIXES = ["/api/auth/2fa", "/api/auth/login", "/api/auth/signup", "/api/auth/reset-password", "/api/stripe"];

// Defense in depth for everything else: strip any field whose key looks
// sensitive before it ever reaches the log, regardless of which route it
// came from.
const SENSITIVE_KEY_PATTERN = /secret|token|password|qrcode|totp|code|credential|authorization/i;
function redactSensitiveFields(value: any): any {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (value && typeof value === "object") {
    const redacted: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSensitiveFields(val);
    }
    return redacted;
  }
  return value;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const skipBody = NEVER_LOG_BODY_PREFIXES.some((prefix) => path.startsWith(prefix));
      if (capturedJsonResponse && !skipBody) {
        logLine += ` :: ${JSON.stringify(redactSensitiveFields(capturedJsonResponse))}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure database is reachable before registering routes
  const dbReady = await testConnection(5, 2000);
  if (!dbReady) {
    console.warn("[WARN] Database unavailable at startup. API routes may return 503 until connection is restored.");
  } else {
    await runMigrations();
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
