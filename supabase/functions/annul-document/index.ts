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
    const { doc_id, motivo } = body as { doc_id: string; motivo: string };

    if (!doc_id?.trim()) return err("doc_id es requerido.");
    if (!motivo?.trim()) return err("El motivo de anulación es obligatorio.");

    // ── Fetch document ──────────────────────────────────────────────────────
    const { data: doc } = await supa
      .from("documents")
      .select("id, state_id, state:document_states(code)")
      .eq("id", doc_id)
      .maybeSingle();

    if (!doc) return err("Documento no encontrado.", 404);

    const currentStateCode = (doc.state as { code: string } | null)?.code;

    if (currentStateCode === "ANULADO") {
      return err("Este documento ya se encuentra ANULADO.", 409);
    }

    // ── Lookup ANULADO state ID ─────────────────────────────────────────────
    const { data: anulState } = await supa
      .from("document_states")
      .select("id")
      .eq("code", "ANULADO")
      .maybeSingle();

    if (!anulState) return err("Estado ANULADO no configurado en el sistema.");

    const prevStateId = doc.state_id;

    // ── Atomic UPDATE: only if still not ANULADO ───────────────────────────
    // Prevents double-annulment when two admin sessions act simultaneously.
    const { data: updated } = await supa
      .from("documents")
      .update({ state_id: anulState.id, updated_at: new Date().toISOString() })
      .eq("id", doc_id)
      .neq("state_id", anulState.id)
      .select("id")
      .maybeSingle();

    if (!updated) {
      return err("El documento fue anulado por otro usuario simultáneamente. Recarga la página.", 409);
    }

    const motivoTrimmed = motivo.trim();

    // ── Insert document history ─────────────────────────────────────────────
    await supa.from("document_history").insert({
      document_id: doc_id,
      user_id: user.id,
      from_state_id: prevStateId,
      to_state_id: anulState.id,
      action: "ANNUL",
      notes: motivoTrimmed,
    });

    // ── Insert audit log ────────────────────────────────────────────────────
    await supa.from("audit_log").insert({
      user_id: user.id,
      action: "ANNUL_DOCUMENT",
      entity_type: "document",
      entity_id: doc_id,
      details: {
        from_state: currentStateCode,
        to_state: "ANULADO",
        motivo: motivoTrimmed,
      },
    });

    return json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado.";
    return err(msg, 500);
  }
});
