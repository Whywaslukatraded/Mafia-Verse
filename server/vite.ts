import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  // Security fix (#11): this used to replace the whole `server` key wholesale,
  // silently discarding vite.config.ts's `server.fs.strict` / `server.fs.deny`
  // dotfile protections, and always set `allowedHosts: true`, which disables
  // Vite's Host-header allowlist (DNS-rebinding protection) unconditionally.
  // This path only runs outside production, but if NODE_ENV were ever
  // misconfigured in a real deployment, this would have been the exposed
  // surface. Now: fs restrictions are preserved by spreading viteConfig.server
  // first, and allowedHosts is only opened up on Replit (where REPL_ID is set
  // and requests come through Replit's proxy on an unpredictable subdomain);
  // everywhere else it's left at Vite's safe default (same-origin only).
  const serverOptions = {
    ...viteConfig.server,
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    ...(process.env.REPL_ID !== undefined ? { allowedHosts: true as const } : {}),
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // Do NOT exit — Vite dev errors (e.g. HMR client disconnect) are not fatal
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
