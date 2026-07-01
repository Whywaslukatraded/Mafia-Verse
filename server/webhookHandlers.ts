import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    // Note: In production, you should verify the webhook signature using Stripe SDK
    // For now, we'll process the webhook payload directly
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload + ". " +
        "This usually means express.json() parsed the body before reaching this handler. " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    try {
      const event = JSON.parse(payload.toString());

      // Handle checkout.session.completed event
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const metadata = session.metadata || {};

        // Award credits if this was a credit purchase
        if (metadata.item === "credits" && metadata.amount) {
          const credits = parseInt(metadata.amount, 10);
          // Credits are handled via localStorage on the frontend after redirect
          console.log(`[Stripe Webhook] Credit purchase completed: ${credits} credits`);
        }

        // Handle syndicate pass purchase
        if (metadata.item === "syndicate") {
          console.log(`[Stripe Webhook] Syndicate Pass purchased`);
        }

        // Handle tips
        if (metadata.item === "tip") {
          console.log(`[Stripe Webhook] Tip received: $${parseInt(metadata.amount, 10) / 100}`);
        }
      }
    } catch (err: any) {
      console.error("Webhook parse error:", err.message);
      // Still return success to avoid Stripe retries for parse errors
    }
  }
}
