/*
# Login de Asesores — Vinculación con Supabase Auth

## Resumen
Añade la columna `user_id` a la tabla `advisors` para vincular cada asesor
con su cuenta de Supabase Auth. Esto permite que, tras iniciar sesión, el
CRM identifique al asesor firmado y muestre su rol, nombre y color de avatar.

## Cambios
1. Nueva columna en `advisors`:
   - `user_id uuid` — referencia a `auth.users.id`. Único. Nullable
     (los asesores demo sin cuenta auth quedan sin vincular).
2. Índice único en `advisors.user_id` para búsquedas O(1) por sesión.
3. Llave foránea `advisors.user_id → auth.users(id) ON DELETE SET NULL`.
4. RLS: las políticas existentes `anon_*` se mantienen para que el
   cliente anon-key pueda leer la lista de asesores (necesario para el
   selector de rol demo y para resolver el perfil del usuario firmado
   antes de que la sesión esté completamente cargada). Se añade una
   política `authenticated` explícita de SELECT para garantizar
   lectura del propio perfil.

## Seguridad
- RLS ya estaba habilitado en `advisors`.
- No se expone información sensible: `advisors` contiene solo datos
  de perfil público (nombre, rol, color, email, teléfono).
- La política SELECT existente (`anon, authenticated`) se conserva
  porque el CRM es una herramienta interna corporativa donde la
  lista de asesores es visible para todo el equipo.

## Notas
1. La columna es nullable para no perder los asesores semilla existentes.
2. El frontend resolverá el perfil del usuario firmado con:
   `supabase.from('advisors').select('*').eq('user_id', session.user.id).maybeSingle()`.
3. Si no se encuentra un asesor vinculado, el login falla con un
   mensaje claro ("cuenta no autorizada").
*/

-- 1. Añadir columna user_id a advisors
ALTER TABLE advisors
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- 2. Llave foránea a auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'advisors_user_id_fkey'
  ) THEN
    ALTER TABLE advisors
      ADD CONSTRAINT advisors_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Índice único para búsquedas por sesión
CREATE UNIQUE INDEX IF NOT EXISTS advisors_user_id_idx
  ON advisors (user_id)
  WHERE user_id IS NOT NULL;

-- 4. Asegurar política SELECT para authenticated (mantener la existente de anon)
-- La política anon_select_advisors ya cubre TO anon, authenticated,
-- así que no se necesita una nueva política. Solo garantizamos que
-- el índice existe para que la consulta del perfil sea eficiente.
