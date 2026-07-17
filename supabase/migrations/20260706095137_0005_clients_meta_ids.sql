/*
# Campos de Indexación de Meta (WhatsApp y Facebook) en Clientes

## Resumen
Añade las columnas `whatsapp_id` y `facebook_id` a la tabla `clients`
para almacenar los IDs únicos de los perfiles de WhatsApp y Facebook
Messenger de cada cliente. Estos campos permiten vincular los mensajes
entrantes recibidos vía webhook con el cliente correcto en el CRM.

## Cambios
1. Nuevas columnas en `clients`:
   - `whatsapp_id text` — ID único del número de WhatsApp del cliente
     (formato: número de teléfono con código de país, ej. "5215512345678").
     Nullable para clientes existentes sin WhatsApp.
   - `facebook_id text` — ID único del perfil de Facebook Messenger del
     cliente (PSID - Page-Scoped ID). Nullable para clientes sin Facebook.
2. Índices únicos parciales en ambas columnas para búsquedas O(1) por
   ID de Meta y para evitar duplicados.
3. Sin cambios en RLS: las políticas existentes cubren las nuevas columnas.

## Notas
1. Ambas columnas son nullable para no perder los clientes semilla.
2. El webhook usará estos campos para hacer upsert: si un mensaje entra
   con un whatsapp_id o facebook_id que ya existe, se vincula al cliente
   existente; si no existe, se crea un nuevo cliente con el ID.
3. Los índices son parciales (WHERE IS NOT NULL) para que los clientes
   sin ID de Meta no ocupen espacio en el índice.
4. `whatsapp_id` y `facebook_id` pueden coexistir (un cliente puede tener
   ambos canales).
*/

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_id text;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS facebook_id text;

CREATE UNIQUE INDEX IF NOT EXISTS clients_whatsapp_id_idx
  ON clients (whatsapp_id)
  WHERE whatsapp_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clients_facebook_id_idx
  ON clients (facebook_id)
  WHERE facebook_id IS NOT NULL;
