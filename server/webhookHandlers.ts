import Stripe from "stripe";
import { getStripeSync, verifyStripeWebhookEvent } from "./stripeClient";
import { pool } from "./db";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload + ". " +
        "This usually means express.json() parsed the body before reaching this handler. " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    // Security fix (#5 / #7): this used to hand the raw payload straight to
    // stripe-replit-sync and stop — nothing in this app ever wrote to
    // account_syndicate_pass, so the client had no server-authoritative
    // record to check and the Syndicate Pass toggle lived only in
    // localStorage. Verifying the event independently here (rather than
    // reaching into stripe-replit-sync's own synced tables, whose schema
    // this app doesn't own) means this app-specific grant logic only ever
    // runs against a cryptographically verified Stripe event.
    try {
      const event = await verifyStripeWebhookEvent(payload, signature);
      await WebhookHandlers.handleAppSpecificEvent(event);
    } catch (err: any) {
      // If signature verification itself failed, let it propagate — the
      // caller should respond 400 so Stripe knows this attempt was rejected.
      // If our own grant logic threw after a *valid* event, also propagate:
      // Stripe will retry the webhook, which is what we want for something
      // as important as actually applying a paid entitlement.
      console.error("Webhook app-specific handling error:", err.message);
      throw err;
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }

  private static async handleAppSpecificEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== "checkout.session.completed") return;
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return;

    const item = session.metadata?.item;
    const supabaseUserId = session.metadata?.supabaseUserId;
    if (!supabaseUserId) return;

    if (item === "syndicate") {
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO account_syndicate_pass (supabase_user_id, active, purchased_at)
           VALUES ($1, true, now())
           ON CONFLICT (supabase_user_id) DO UPDATE SET active = true`,
          [supabaseUserId]
        );
      } finally {
        client.release();
      }
    } else if (item === "credits") {
      const credits = parseInt(session.metadata?.amount || "", 10);
      if (Number.isFinite(credits) && credits > 0) {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO account_credits (supabase_user_id, credits) VALUES ($1, $2)
             ON CONFLICT (supabase_user_id) DO UPDATE SET credits = account_credits.credits + $2`,
            [supabaseUserId, credits]
          );
        } finally {
          client.release();
        }
      }
    }
    // Any other item type (e.g. "tip") intentionally has no grant here —
    // there's nothing to unlock server-side for a tip.
  }
}
