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

async function getAdminProfile(supa: SupabaseClient, userId: string) {
  const { data } = await supa
    .from("profiles")
    .select("id, is_active, role:roles(name)")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

async function getRoleId(supa: SupabaseClient, roleName: string): Promise<string | null> {
  const { data } = await supa.from("roles").select("id").eq("name", roleName).maybeSingle();
  return data?.id ?? null;
}

async function writeAudit(
  supa: SupabaseClient,
  adminId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  await supa.from("audit_log").insert({
    user_id: adminId,
    action,
    entity_type: "user",
    entity_id: entityId,
    details,
  });
}

async function handleCreate(
  supa: SupabaseClient,
  body: Record<string, unknown>,
  adminId: string,
) {
  const { full_name, username, password, role_name, branch_id, is_active } = body as {
    full_name: string;
    username: string;
    password: string;
    role_name: string;
    branch_id: string | null;
    is_active: boolean;
  };

  if (!full_name?.trim()) return err("El nombre es obligatorio.");
  if (!username?.trim()) return err("El usuario es obligatorio.");
  if (!password || password.length < 6) return err("La contrasena debe tener al menos 6 caracteres.");
  if (!role_name) return err("El rol es obligatorio.");
  if (role_name === "CARGADOR" && !branch_id) return err("La sucursal es obligatoria para el rol Cargador.");

  const usernameLower = username.toLowerCase().trim();
  const email = `${usernameLower}@gestor.internal`;

  const { data: existing } = await supa
    .from("profiles")
    .select("id")
    .eq("username", usernameLower)
    .maybeSingle();
  if (existing) return err("El nombre de usuario ya existe. Elija otro.");

  const role_id = await getRoleId(supa, role_name);
  if (!role_id) return err(`Rol "${role_name}" no encontrado.`);

  const { data: authData, error: authErr } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
  });
  if (authErr || !authData.user) return err(authErr?.message ?? "Error al crear usuario en auth.");

  const { error: profileErr } = await supa.from("profiles").insert({
    id: authData.user.id,
    full_name: full_name.trim(),
    username: usernameLower,
    role_id,
    branch_id: branch_id || null,
    is_active: is_active !== false,
  });

  if (profileErr) {
    await supa.auth.admin.deleteUser(authData.user.id);
    return err(profileErr.message);
  }

  await writeAudit(supa, adminId, "CREATE_USER", authData.user.id, {
    username: usernameLower,
    full_name,
    role_name,
    branch_id,
    is_active,
  });

  return json({ success: true, userId: authData.user.id });
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
async function handleUpdate(
  supa: SupabaseClient,
  body: Record<string, unknown>,
  adminId: string,
) {
  const { user_id, full_name, role_name, branch_id, is_active } = body as {
    user_id: string;
    full_name: string;
    role_name: string;
    branch_id: string | null;
    is_active: boolean;
  };

  if (!user_id) return err("user_id es requerido.");
  if (!full_name?.trim()) return err("El nombre es obligatorio.");
  if (!role_name) return err("El rol es obligatorio.");
  if (role_name === "CARGADOR" && !branch_id) return err("La sucursal es obligatoria para el rol Cargador.");

  const role_id = await getRoleId(supa, role_name);
  if (!role_id) return err(`Rol "${role_name}" no encontrado.`);

  const { data: current } = await supa
    .from("profiles")
    .select("*, role:roles(name)")
    .eq("id", user_id)
    .maybeSingle();
  if (!current) return err("Usuario no encontrado.", 404);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (current.full_name !== full_name.trim()) changes.full_name = { from: current.full_name, to: full_name.trim() };
  if ((current.role as { name: string } | null)?.name !== role_name) changes.role = { from: (current.role as { name: string } | null)?.name, to: role_name };
  if (current.branch_id !== (branch_id || null)) changes.branch_id = { from: current.branch_id, to: branch_id || null };
  if (current.is_active !== is_active) changes.is_active = { from: current.is_active, to: is_active };

  const { error: updateErr } = await supa
    .from("profiles")
    .update({ full_name: full_name.trim(), role_id, branch_id: branch_id || null, is_active })
    .eq("id", user_id);

  if (updateErr) return err(updateErr.message);

  const actions: string[] = [];
  if (changes.role) actions.push("CHANGE_ROLE");
  if (changes.is_active !== undefined) actions.push(is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER");
  if (Object.keys(changes).length > 0 && !actions.length) actions.push("UPDATE_USER");
  if (changes.role || changes.branch_id || changes.full_name) {
    if (!actions.includes("UPDATE_USER") && !actions.includes("CHANGE_ROLE")) actions.push("UPDATE_USER");
  }

  const action = actions.length > 1 ? "UPDATE_USER" : (actions[0] ?? "UPDATE_USER");
  await writeAudit(supa, adminId, action, user_id, { changes });

  return json({ success: true });
}

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
async function handleChangePassword(
  supa: SupabaseClient,
  body: Record<string, unknown>,
  adminId: string,
) {
  const { user_id, new_password } = body as { user_id: string; new_password: string };

  if (!user_id) return err("user_id es requerido.");
  if (!new_password || new_password.length < 6) return err("La contrasena debe tener al menos 6 caracteres.");

  const { error: pwErr } = await supa.auth.admin.updateUserById(user_id, {
    password: new_password,
  });
  if (pwErr) return err(pwErr.message);

  await writeAudit(supa, adminId, "CHANGE_PASSWORD", user_id, {});

  return json({ success: true });
}

// ── TOGGLE STATUS ─────────────────────────────────────────────────────────────
async function handleToggleStatus(
  supa: SupabaseClient,
  body: Record<string, unknown>,
  adminId: string,
) {
  const { user_id, is_active } = body as { user_id: string; is_active: boolean };

  if (!user_id) return err("user_id es requerido.");
  if (typeof is_active !== "boolean") return err("is_active debe ser boolean.");

  // Prevent admin from deactivating themselves
  if (user_id === adminId && !is_active) {
    return err("No puedes desactivar tu propio usuario.");
  }

  const { error: upErr } = await supa
    .from("profiles")
    .update({ is_active })
    .eq("id", user_id);

  if (upErr) return err(upErr.message);

  await writeAudit(supa, adminId, is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER", user_id, {});

  return json({ success: true });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Sin autorizacion.", 401);

    const token = authHeader.replace("Bearer ", "");
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authenticate caller
    const { data: { user }, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !user) return err("Token invalido.", 401);

    // Authorize: must be ADMINISTRADOR
    const adminProfile = await getAdminProfile(supa, user.id);
    if (!adminProfile || (adminProfile.role as { name: string } | null)?.name !== "ADMINISTRADOR") {
      return err("Acceso denegado. Se requiere rol ADMINISTRADOR.", 403);
    }
    if (!adminProfile.is_active) return err("Tu cuenta esta inactiva.", 403);

    const body = await req.json() as Record<string, unknown>;
    const action = body.action as string;

    switch (action) {
      case "create": return handleCreate(supa, body, user.id);
      case "update": return handleUpdate(supa, body, user.id);
      case "change-password": return handleChangePassword(supa, body, user.id);
      case "toggle-status": return handleToggleStatus(supa, body, user.id);
      default: return err(`Accion desconocida: ${action}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado";
    return err(msg, 500);
  }
});
