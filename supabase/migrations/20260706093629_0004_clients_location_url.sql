/*
# Campo de Ubicación / Google Maps en Clientes

## Resumen
Añade la columna `location_url` a la tabla `clients` para almacenar enlaces
geográficos (Google Maps, coordenadas, o direcciones de entrega) asociados a
cada cliente. Preparado para la gestión de visitas en campo y logística.

## Cambios
1. Nueva columna en `clients`:
   - `location_url text` — Enlace de Google Maps, coordenadas o dirección
     de entrega. Nullable (los clientes existentes quedan sin ubicación).
2. Sin cambios en RLS: las políticas existentes `anon, authenticated`
   cubren la nueva columna automáticamente (RLS es a nivel de fila, no
   de columna).

## Notas
1. La columna es nullable para no perder los clientes semilla existentes.
2. El frontend la usará para mostrar un enlace "Ver en mapa" y para
   precargar la ubicación en el módulo de Campo y Rutas.
3. Acepta cualquier formato: URL de Google Maps, "lat,lng", o dirección
   de texto libre.
*/

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS location_url text;
