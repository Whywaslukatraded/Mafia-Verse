import Stripe from "stripe";

// Stripe credentials come from environment variables (set them in the Render
// dashboard). The old Replit connector fallback was removed along with the
// rest of the Replit tooling — on Render it could never be reached anyway.
async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey: string; webhookSecret?: string }> {
  const envSecret = process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY;
  const envWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (envSecret && envPublishable) {
    return { secretKey: envSecret, publishableKey: envPublishable, webhookSecret: envWebhookSecret };
  }

  throw new Error(
    "No Stripe credentials available. " +
    "Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in your environment variables."
  );
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
// and returns the parsed event. App-specific logic (granting entitlements
// like the Syndicate Pass — see webhookHandlers.ts) reads event.type /
// event.data.object directly from a cryptographically verified Stripe event,
// same as any standard Stripe webhook integration.
export async function verifyStripeWebhookEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const { secretKey, webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook signatures.");
  }
  const stripe = new Stripe(secretKey, { apiVersion: "2026-02-25.clover" as any });
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
