import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

// Try env vars first, then fall back to the Replit connector API
async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey: string; webhookSecret?: string }> {
  // 1. Use explicit keys from secrets if available
  const envSecret = process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;
  if (envSecret && envPublishable) {
    return { secretKey: envSecret, publishableKey: envPublishable };
  }

  // 2. Fall back to the Replit Stripe connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "No Stripe credentials available. " +
      "Set STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY in secrets, " +
      "or connect Stripe via the Integrations tab."
    );
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  async function tryFetch(env?: string) {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set("include_secrets", "true");
    url.searchParams.set("connector_names", "stripe");
    if (env) url.searchParams.set("environment", env);

    const resp = await fetch(url.toString(), {
      headers: { "Accept": "application/json", "X-Replit-Token": xReplitToken! },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.items?.[0]?.settings;
  }

  let settings = await tryFetch(targetEnvironment);
  if (!settings) settings = await tryFetch();

  if (!settings || !settings.secret || !settings.publishable) {
    throw new Error(
      "Stripe credentials not found. " +
      "Please set STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY in secrets, " +
      "or connect Stripe via the Integrations tab."
    );
  }

  return {
    secretKey: settings.secret,
    publishableKey: settings.publishable,
    webhookSecret: settings.webhook_secret,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey, { apiVersion: "2026-02-25.clover" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getStripeCredentials();
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getStripeCredentials();
  return secretKey;
}

// StripeSync singleton for webhook processing
let stripeSync: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
