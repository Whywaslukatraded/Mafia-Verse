import Stripe from "stripe";

// Stripe credentials must be set via environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY not set. Stripe functionality will be limited.");
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY not configured. Please set it in your environment variables.");
  }
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  if (!STRIPE_PUBLISHABLE_KEY) {
    throw new Error("VITE_STRIPE_PUBLISHABLE_KEY not configured. Please set it in your environment variables.");
  }
  return STRIPE_PUBLISHABLE_KEY;
}

export async function getStripeSecretKey(): Promise<string> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY not configured. Please set it in your environment variables.");
  }
  return STRIPE_SECRET_KEY;
}
