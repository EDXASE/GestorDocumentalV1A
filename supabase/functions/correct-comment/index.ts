import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Sin autorización.", 401);

    const token = authHeader.replace("Bearer ", "");
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authenticate ────────────────────────────────────────────────────────
    const { data: { user }, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !user) return err("Token inválido.", 401);

    // ── Authorize: must be ADMINISTRADOR ───────────────────────────────────
    const { data: adminProfile } = await supa
      .from("profiles")
      .select("id, is_active, role:roles(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (!adminProfile) return err("Perfil no encontrado.", 404);
    if (!adminProfile.is_active) return err("Tu cuenta está inactiva.", 403);
    if ((adminProfile.role as { name: string } | null)?.name !== "ADMINISTRADOR") {
      return err("Acceso denegado. Se requiere rol ADMINISTRADOR.", 403);
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json() as Record<string, unknown>;
    const { comment_id, new_text, reason } = body as {
      comment_id: string;
      new_text: string;
      reason: string;
    };

    if (!comment_id?.trim()) return err("comment_id es requerido.");
    if (!new_text?.trim()) return err("El nuevo texto del comentario es obligatorio.");
    if (!reason?.trim()) return err("El motivo de la corrección es obligatorio.");

    // ── Fetch current comment text ──────────────────────────────────────────
    const { data: comment } = await supa
      .from("document_comments")
      .select("id, comment, document_id")
      .eq("id", comment_id)
      .maybeSingle();

    if (!comment) return err("Comentario no encontrado.", 404);

    const previousText = comment.comment as string;
    const newTextTrimmed = new_text.trim();
    const reasonTrimmed = reason.trim();

    // ── Insert correction record (preserves original) ───────────────────────
    await supa.from("document_comment_edits").insert({
      comment_id,
      previous_text: previousText,
      new_text: newTextTrimmed,
      reason: reasonTrimmed,
      edited_by: user.id,
    });

    // ── Update comment text ─────────────────────────────────────────────────
    await supa
      .from("document_comments")
      .update({ comment: newTextTrimmed })
      .eq("id", comment_id);

    // ── Audit log ───────────────────────────────────────────────────────────
    await supa.from("audit_log").insert({
      user_id: user.id,
      action: "CORRECT_COMMENT",
      entity_type: "document_comment",
      entity_id: comment_id,
      details: {
        document_id: comment.document_id,
        previous_text: previousText,
        new_text: newTextTrimmed,
        reason: reasonTrimmed,
      },
    });

    return json({ success: true, new_text: newTextTrimmed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado.";
    return err(msg, 500);
  }
});
