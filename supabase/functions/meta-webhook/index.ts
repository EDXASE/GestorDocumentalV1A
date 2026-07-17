import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Hub-Signature-256, X-Hub-Signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GET = webhook verification (Meta callback verification flow)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expectedToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve channel IDs once
    const { data: channels } = await supabase
      .from("channels")
      .select("id, slug")
      .in("slug", ["whatsapp", "messenger"]);

    const whatsappChannel = channels?.find((c: any) => c.slug === "whatsapp");
    const messengerChannel = channels?.find((c: any) => c.slug === "messenger");

    const processed: string[] = [];

    // Detect platform: WhatsApp Cloud API vs Facebook Messenger
    const isWhatsApp = payload?.object === "whatsapp_business_account" || !!payload?.entry?.[0]?.changes?.[0]?.value?.messaging_product;
    const isMessenger = payload?.object === "page" && !!payload?.entry?.[0]?.messaging;

    if (isWhatsApp) {
      const entries = payload?.entry ?? [];
      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;
          const messages = value?.messages ?? [];
          const contacts = value?.contacts ?? [];
          const metadata = value?.metadata;

          for (const msg of messages) {
            const from = msg?.from as string | undefined; // phone number
            const msgId = msg?.id as string | undefined;
            const type = msg?.type as string | undefined;
            const text = msg?.text?.body as string | undefined;
            const timestamp = msg?.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

            if (!from || !msgId) continue;

            // Find or create client by whatsapp_id
            const contactInfo = contacts.find((c: any) => c?.wa_id === from);
            const profileName = contactInfo?.profile?.name ?? `WhatsApp ${from}`;

            const { data: existing } = await supabase
              .from("clients")
              .select("id")
              .eq("whatsapp_id", from)
              .maybeSingle();

            let clientId: string;

            if (existing?.id) {
              clientId = existing.id;
            } else {
              const { data: created, error: createErr } = await supabase
                .from("clients")
                .insert({
                  name: profileName,
                  phone: from,
                  whatsapp_id: from,
                  channel_id: whatsappChannel?.id ?? null,
                  stage: "contacto_inicial",
                  tags: ["WhatsApp"],
                })
                .select("id")
                .single();

              if (createErr || !created) continue;
              clientId = created.id;
            }

            // Find or create conversation
            const { data: conv } = await supabase
              .from("conversations")
              .select("id")
              .eq("client_id", clientId)
              .eq("channel_id", whatsappChannel?.id ?? null)
              .maybeSingle();

            let conversationId: string;
            if (conv?.id) {
              conversationId = conv.id;
              await supabase
                .from("conversations")
                .update({
                  last_message_at: timestamp,
                  unread_count: 1,
                  status: "open",
                })
                .eq("id", conversationId);
            } else {
              const { data: newConv, error: convErr } = await supabase
                .from("conversations")
                .insert({
                  client_id: clientId,
                  channel_id: whatsappChannel?.id ?? null,
                  status: "open",
                  last_message_at: timestamp,
                  unread_count: 1,
                })
                .select("id")
                .single();
              if (convErr || !newConv) continue;
              conversationId = newConv.id;
            }

            // Insert message
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              body: text ?? `[${type}]`,
              direction: "inbound",
              sender: "client",
              ai_suggested: false,
            });

            // Update last_contact_at on client
            await supabase
              .from("clients")
              .update({ last_contact_at: timestamp, updated_at: timestamp })
              .eq("id", clientId);

            processed.push(`wa:${msgId}`);
          }
        }
      }
    } else if (isMessenger) {
      const entries = payload?.entry ?? [];
      for (const entry of entries) {
        const messaging = entry?.messaging ?? [];
        for (const event of messaging) {
          const senderId = event?.sender?.id as string | undefined;
          const recipientId = event?.recipient?.id as string | undefined;
          const message = event?.message;
          const timestamp = event?.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();

          if (!senderId || !message) continue;

          const msgId = message?.mid as string | undefined;
          const text = message?.text as string | undefined;

          if (!msgId) continue;

          // Find or create client by facebook_id
          const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .eq("facebook_id", senderId)
            .maybeSingle();

          let clientId: string;

          if (existing?.id) {
            clientId = existing.id;
          } else {
            const { data: created, error: createErr } = await supabase
              .from("clients")
              .insert({
                name: `Facebook ${senderId.slice(-6)}`,
                facebook_id: senderId,
                channel_id: messengerChannel?.id ?? null,
                stage: "contacto_inicial",
                tags: ["Messenger"],
              })
              .select("id")
              .single();

            if (createErr || !created) continue;
            clientId = created.id;
          }

          // Find or create conversation
          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("client_id", clientId)
            .eq("channel_id", messengerChannel?.id ?? null)
            .maybeSingle();

          let conversationId: string;
          if (conv?.id) {
            conversationId = conv.id;
            await supabase
              .from("conversations")
              .update({
                last_message_at: timestamp,
                unread_count: 1,
                status: "open",
              })
              .eq("id", conversationId);
          } else {
            const { data: newConv, error: convErr } = await supabase
              .from("conversations")
              .insert({
                client_id: clientId,
                channel_id: messengerChannel?.id ?? null,
                status: "open",
                last_message_at: timestamp,
                unread_count: 1,
              })
              .select("id")
              .single();
            if (convErr || !newConv) continue;
            conversationId = newConv.id;
          }

          // Insert message
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            body: text ?? "[mensaje]",
            direction: "inbound",
            sender: "client",
            ai_suggested: false,
          });

          // Update last_contact_at on client
          await supabase
            .from("clients")
            .update({ last_contact_at: timestamp, updated_at: timestamp })
            .eq("id", clientId);

          processed.push(`fb:${msgId}`);
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Unrecognized payload format", object: payload?.object }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, processed, count: processed.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
