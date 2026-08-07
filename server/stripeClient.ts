import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

// Try env vars first, then fall back to the Replit connector API
async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey: string; webhookSecret?: string }> {
  // 1. Use explicit keys from secrets if available
  const envSecret = process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY;
  const envWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (envSecret && envPublishable) {
    return { secretKey: envSecret, publishableKey: envPublishable, webhookSecret: envWebhookSecret };
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

// Independently verifies a raw webhook payload against Stripe's signature
// and returns the parsed event. This exists so app-specific logic (granting
// entitlements like the Syndicate Pass — see webhookHandlers.ts) doesn't
// need to know anything about stripe-replit-sync's internal table schema;
// it just reads event.type / event.data.object directly from a
// cryptographically verified Stripe event, same as any standard Stripe
// webhook integration.
export async function verifyStripeWebhookEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const { secretKey, webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook signatures.");
  }
  const stripe = new Stripe(secretKey, { apiVersion: "2026-02-25.clover" as any });
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// StripeSync singleton for webhook processing
let stripeSync: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const { secretKey, webhookSecret } = await getStripeCredentials();
    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification " +
        "cannot run without it — set it in your environment variables " +
        "(copy the signing secret from your Stripe webhook/event destination)."
      );
    }
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
      stripeWebhookSecret: webhookSecret,
    });
  }
  return stripeSync;
}
