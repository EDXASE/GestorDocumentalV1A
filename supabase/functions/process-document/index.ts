import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

async function getStateId(supa: SupabaseClient, code: string): Promise<string | null> {
  const { data } = await supa.from("document_states").select("id").eq("code", code).maybeSingle();
  return data?.id ?? null;
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

    // ── Authenticate caller ───────────────────────────────────────────────────
    const { data: { user }, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !user) return err("Token inválido.", 401);

    // ── Authorize: must be PROCESADOR ─────────────────────────────────────────
    const { data: processorProfile } = await supa
      .from("profiles")
      .select("id, is_active, role:roles(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (!processorProfile) return err("Perfil no encontrado.", 404);
    if (!processorProfile.is_active) return err("Tu cuenta está inactiva.", 403);
    const roleName = (processorProfile.role as { name: string } | null)?.name;
    if (roleName !== "PROCESADOR") {
      return err("Acceso denegado. Se requiere rol PROCESADOR.", 403);
    }

    // ── Parse body ─────────────────────────────────────────────────────────────
    const body = await req.json() as Record<string, unknown>;
    const { doc_id, action, comment } = body as {
      doc_id: string;
      action: "approve" | "reject";
      comment?: string;
    };

    if (!doc_id?.trim()) return err("doc_id es requerido.");
    if (action !== "approve" && action !== "reject") return err("Acción inválida. Use 'approve' o 'reject'.");

    // ── Fetch document ────────────────────────────────────────────────────────
    const { data: doc } = await supa
      .from("documents")
      .select("id, branch_id, state_id, state:document_states(code)")
      .eq("id", doc_id)
      .maybeSingle();

    if (!doc) return err("Documento no encontrado.", 404);

    const currentStateCode = (doc.state as { code: string } | null)?.code;

    // ── Verify document is PENDIENTE ──────────────────────────────────────────
    if (currentStateCode !== "PENDIENTE") {
      return err(
        `El documento no está en estado PENDIENTE (estado actual: ${currentStateCode ?? "desconocido"}). Es posible que ya haya sido procesado por otro usuario.`,
        409,
      );
    }

    // ── Verify processor is assigned to this branch ───────────────────────────
    const { data: assignment } = await supa
      .from("branch_processor_assignments")
      .select("id")
      .eq("processor_id", user.id)
      .eq("branch_id", doc.branch_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!assignment) {
      return err("No tienes asignación activa para la sucursal de este documento.", 403);
    }

    // ── Lookup state IDs ──────────────────────────────────────────────────────
    const pendingStateId = await getStateId(supa, "PENDIENTE");
    const newStateCode = action === "approve" ? "APROBADO" : "RECHAZADO";
    const newStateId = await getStateId(supa, newStateCode);

    if (!pendingStateId || !newStateId) return err("No se encontraron los estados requeridos.");

    // ── Atomic conditional UPDATE ─────────────────────────────────────────────
    // The WHERE clause `.eq("state_id", pendingStateId)` ensures only one concurrent
    // processor succeeds. If another processor already changed the state, no rows update
    // and `updated` will be null — preventing double-processing at the DB level.
    const { data: updated } = await supa
      .from("documents")
      .update({
        state_id: newStateId,
        processed_by: user.id,
      })
      .eq("id", doc_id)
      .eq("state_id", pendingStateId)
      .select("id")
      .maybeSingle();

    if (!updated) {
      // No rows updated — someone else processed it between our check and this UPDATE
      return err(
        "Este documento ya fue procesado por otro usuario mientras revisabas. Recarga la página.",
        409,
      );
    }

    const commentText = comment?.trim() ?? null;

    // ── Insert procesador comment ─────────────────────────────────────────────
    if (commentText) {
      await supa.from("document_comments").insert({
        document_id: doc_id,
        user_id: user.id,
        comment: commentText,
      });
    }

    // ── Insert document history ───────────────────────────────────────────────
    await supa.from("document_history").insert({
      document_id: doc_id,
      user_id: user.id,
      from_state_id: doc.state_id,
      to_state_id: newStateId,
      action: action === "approve" ? "APPROVE" : "REJECT",
      notes: commentText,
    });

    // ── Insert audit log ──────────────────────────────────────────────────────
    await supa.from("audit_log").insert({
      user_id: user.id,
      action: action === "approve" ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
      entity_type: "document",
      entity_id: doc_id,
      details: {
        from_state: "PENDIENTE",
        to_state: newStateCode,
        comment: commentText,
        branch_id: doc.branch_id,
      },
    });

    return json({ success: true, newState: newStateCode });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado";
    return err(msg, 500);
  }
});
