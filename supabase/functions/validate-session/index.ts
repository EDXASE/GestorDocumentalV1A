import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Route → allowed roles mapping (mirrors frontend routes.ts)
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/dashboard": ["ADMINISTRADOR", "CARGADOR", "PROCESADOR", "CONSULTOR"],
  "/caja-general": ["ADMINISTRADOR", "CARGADOR", "PROCESADOR", "CONSULTOR"],
  "/caja-chica": ["ADMINISTRADOR", "CARGADOR", "PROCESADOR", "CONSULTOR"],
  "/mis-documentos": ["CARGADOR"],
  "/procesamiento": ["PROCESADOR"],
  "/seguimiento": ["CONSULTOR", "ADMINISTRADOR"],
  "/documentos": ["ADMINISTRADOR", "CARGADOR", "PROCESADOR", "CONSULTOR"],
  "/usuarios": ["ADMINISTRADOR"],
  "/sucursales": ["ADMINISTRADOR"],
  "/asignaciones": ["ADMINISTRADOR"],
  "/auditoria": ["ADMINISTRADOR"],
  "/descargas": ["ADMINISTRADOR"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ valid: false, reason: "NO_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ valid: false, reason: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch profile with role + branch
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id, username, full_name, is_active, branch_id,
        role:roles(id, name, description),
        branch:branches(id, code, name)
      `)
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ valid: false, reason: "PROFILE_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!profile.is_active) {
      return new Response(
        JSON.stringify({ valid: false, reason: "INACTIVE_USER" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roleName = (profile.role as { name: string } | null)?.name ?? "";

    // For PROCESADOR: fetch active assigned branches with per-branch section access
    let assignedBranchIds: string[] | null = null;
    let assignedBranches: { branchId: string; can_caja_general: boolean; can_caja_chica: boolean }[] | null = null;
    if (roleName === "PROCESADOR") {
      const { data: assignments } = await supabase
        .from("branch_processor_assignments")
        .select("branch_id, can_caja_general, can_caja_chica")
        .eq("processor_id", user.id)
        .eq("is_active", true);
      const list = (assignments ?? []) as { branch_id: string; can_caja_general: boolean; can_caja_chica: boolean }[];
      assignedBranchIds = list.map((a) => a.branch_id);
      assignedBranches = list.map((a) => ({
        branchId: a.branch_id,
        can_caja_general: a.can_caja_general,
        can_caja_chica: a.can_caja_chica,
      }));
    }

    // Optional: validate route access if route provided in POST body
    let routeAllowed = true;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        const requestedRoute = body?.route as string | null ?? null;
        if (requestedRoute) {
          const allowedRoles = ROUTE_PERMISSIONS[requestedRoute] ?? null;
          if (allowedRoles !== null) {
            routeAllowed = allowedRoles.includes(roleName);
          }
        }
      } catch (_) {
        // body is optional
      }
    }

    if (!routeAllowed) {
      return new Response(
        JSON.stringify({ valid: false, reason: "FORBIDDEN_ROUTE", role: roleName }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        userId: user.id,
        role: roleName,
        profile,
        assignedBranchIds,
        assignedBranches,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ valid: false, reason: "SERVER_ERROR", detail: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
