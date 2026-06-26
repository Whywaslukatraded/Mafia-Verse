import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { supabaseUserId } = await req.json();
    if (!supabaseUserId) {
      return new Response(
        JSON.stringify({ error: "Missing supabaseUserId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if this user has already been credited to their referrer
    const { data: existing } = await supabase
      .from("referrals")
      .select("referrer_id, credits_awarded")
      .eq("referred_id", supabaseUserId)
      .maybeSingle();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "No referral found for this user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existing.credits_awarded > 0) {
      return new Response(
        JSON.stringify({ success: true, alreadyAwarded: true, credits: existing.credits_awarded }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Award credits to referrer
    const REWARD = 25;
    const { data: referrerProfile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("supabase_user_id", existing.referrer_id)
      .maybeSingle();

    const newCredits = (referrerProfile?.credits || 0) + REWARD;

    await supabase
      .from("profiles")
      .update({ credits: newCredits })
      .eq("supabase_user_id", existing.referrer_id);

    await supabase
      .from("referrals")
      .update({ credits_awarded: REWARD })
      .eq("referred_id", supabaseUserId);

    return new Response(
      JSON.stringify({ success: true, creditsAwarded: REWARD, referrerCredits: newCredits }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
