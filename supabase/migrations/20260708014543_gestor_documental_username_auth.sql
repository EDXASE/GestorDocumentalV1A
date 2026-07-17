/*
# GESTOR DOCUMENTAL - Autenticacion por usuario + Admin inicial

## Cambios
1. Agrega columna `username` (text, unique, not null) a la tabla `profiles`.
   - Almacena el nombre de usuario (login) en minusculas.
   - El email en auth.users se construye como `{username}@gestor.internal`.

2. Crea el usuario administrador inicial en auth.users y profiles:
   - Usuario: admin
   - Contrasena: Admin123!
   - Nombre: Administrador del Sistema
   - Rol: ADMINISTRADOR
   - Estado: ACTIVO

## Seguridad
- La contrasena se almacena como hash bcrypt via `crypt()` de pgcrypto.
- La migracion es idempotente: no crea duplicados si ya existe el admin.
- El email `@gestor.internal` distingue cuentas internas de otras.

## Notas importantes
1. El campo `username` es lowercase + unique. No se puede repetir entre usuarios.
2. El flujo de login: el frontend recibe `username`, construye el email y llama a signInWithPassword.
3. La validacion de estado ACTIVO/INACTIVO se realiza en el edge function `validate-session` DESPUES del login de Supabase.
*/

-- Habilitar pgcrypto para bcrypt (necesario para cifrado de contrasenas)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- AGREGAR COLUMNA username A profiles
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Crear indice unico (idempotente via IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles(username);

-- ============================================================
-- CREAR USUARIO ADMINISTRADOR INICIAL
-- ============================================================

DO $$
DECLARE
  v_admin_id    uuid;
  v_role_id     uuid;
BEGIN
  -- Solo crear si no existe aun
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@gestor.internal') THEN

    v_admin_id := gen_random_uuid();

    SELECT id INTO v_role_id FROM roles WHERE name = 'ADMINISTRADOR';
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'Rol ADMINISTRADOR no encontrado. Ejecutar migracion base primero.';
    END IF;

    -- Insertar en auth.users con contrasena hasheada (Admin123!)
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@gestor.internal',
      crypt('Admin123!', gen_salt('bf', 12)),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    -- Insertar perfil (la migracion corre como superusuario, bypasea RLS)
    INSERT INTO profiles (id, role_id, branch_id, full_name, username, is_active)
    VALUES (v_admin_id, v_role_id, NULL, 'Administrador del Sistema', 'admin', true);

  END IF;
END $$;

-- ============================================================
-- AHORA HACER username NOT NULL
-- (seguro porque ya existe el admin con username no nulo)
-- ============================================================
ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;

-- ============================================================
-- POLITICAS ADICIONALES: permitir que cada usuario lea su propio
-- username (para mostrar en la UI), ya cubierto por la politica
-- existente "read_own_or_all_profile". Sin cambios adicionales.
-- ============================================================
