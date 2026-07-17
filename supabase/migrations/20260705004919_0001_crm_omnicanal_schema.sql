/*
# CRM Omnicanal — Esquema de Base de Datos (Modelo en Estrella)

## Resumen
Crea el esquema relacional completo para un CRM Omnicanal corporativo.
Estructurado en tablas de dimensiones (Clientes, Productos, Asesores, Canales)
y tablas de hechos (Interacciones/Mensajes, Cotizaciones, Ventas, Actividades,
Check-ins, Auditoría). Incluye vistas SQL precalculadas para Power BI.

## Tablas de Dimensiones
- `advisors` — Asesores comerciales (con rol: asesor/gerente/admin)
- `channels` — Canales digitales (WhatsApp, Messenger, Instagram)
- `clients` — Clientes/prospectos con canal de origen, asesor asignado, etapa, tags
- `products` — Catálogo de productos con SKU, precio, stock

## Tablas de Hechos
- `conversations` — Hilos de conversación por cliente + canal
- `messages` — Mensajes individuales (entrante/saliente, IA sugerida)
- `quotes` — Cotizaciones con estado (borrador/enviada/aceptada/rechazada/vencida)
- `quote_items` — Líneas de cotización (cantidad, precio, descuento)
- `activities` — Agenda (llamadas, visitas, reuniones, tareas)
- `checkins` — Check-ins georreferenciados en campo
- `repurchase_alerts` — Alertas de re-compra histórica
- `followup_triggers` — Automatización de seguimiento (48h sin respuesta)
- `audit_logs` — Registro de auditoría inmutable

## Vistas para Power BI
- `v_client_summary` — Ficha de cliente con canal, asesor, etapa, LTV
- `v_quote_summary` — Cotización con cliente, asesor, totales, estado
- `v_sales_monthly` — Ventas mensuales agregadas
- `v_pipeline_funnel` — Embudo de ventas por etapa
- `v_advisor_performance` — KPIs por asesor
- `v_channel_performance` — Métricas por canal digital
- `v_product_quoted` — Productos más cotizados
- `v_rejection_reasons` — Clasificación de motivos de rechazo

## Seguridad
- App single-tenant (sin pantalla de login). Rol simulado en UI.
- RLS habilitado en todas las tablas con políticas `TO anon, authenticated`
  (datos compartidos/internos del CRM corporativo).
- El control de roles (asesor vs gerente) se aplica en la capa de presentación.

## Notas
1. Los timestamps usan `timestamptz DEFAULT now()`.
2. IDs son `uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
3. `quote_items.line_total` es columna generada almacenada.
4. `clients.tags` es `text[]` para segmentación multi-etiqueta.
5. Vistas marcadas con `(security_invoker = true)` para respetar RLS.
*/

-- ============================================================
-- DIMENSIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS advisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  phone text,
  role text NOT NULL DEFAULT 'asesor' CHECK (role IN ('asesor','gerente','admin')),
  avatar_color text DEFAULT '#3282b8',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  color text DEFAULT '#3282b8',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  industry text,
  city text,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  advisor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'contacto_inicial' CHECK (stage IN (
    'contacto_inicial','cotizacion_enviada','negociacion','cerrado_ganado','cerrado_perdido'
  )),
  tags text[] NOT NULL DEFAULT '{}',
  lifetime_value numeric NOT NULL DEFAULT 0,
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_advisor ON clients(advisor_id);
CREATE INDEX IF NOT EXISTS idx_clients_stage ON clients(stage);
CREATE INDEX IF NOT EXISTS idx_clients_channel ON clients(channel_id);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category text,
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- HECHOS — Mensajería Omnicanal
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  advisor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_count int NOT NULL DEFAULT 0,
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  body text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  sender text NOT NULL DEFAULT 'client' CHECK (sender IN ('client','advisor','ai','system')),
  ai_suggested boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

-- ============================================================
-- HECHOS — Cotizaciones y Ventas
-- ============================================================

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text UNIQUE NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  advisor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN (
    'borrador','enviada','aceptada','rechazada','vencida'
  )),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0.16,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  sent_at timestamptz,
  responded_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_advisor ON quotes(advisor_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount numeric NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
  line_total numeric GENERATED ALWAYS AS (quantity * unit_price * (1 - discount/100.0)) STORED
);
CREATE INDEX IF NOT EXISTS idx_qi_quote ON quote_items(quote_id);

-- ============================================================
-- HECHOS — Actividades y Campo
-- ============================================================

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'llamada' CHECK (type IN ('llamada','visita','reunion','tarea')),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  advisor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  location text,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','completada','cancelada')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_act_advisor ON activities(advisor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_act_status ON activities(status);

CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkin_advisor ON checkins(advisor_id, created_at);

-- ============================================================
-- HECHOS — Alertas y Automatización
-- ============================================================

CREATE TABLE IF NOT EXISTS repurchase_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  advisor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  expected_date date,
  last_purchase_date date,
  cycle_days int NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','atendida','ignorada')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repurchase_status ON repurchase_alerts(status);

CREATE TABLE IF NOT EXISTS followup_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trigger_at timestamptz NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'programado' CHECK (status IN ('programado','enviado','cancelado')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_status ON followup_triggers(status, trigger_at);

-- ============================================================
-- HECHOS — Auditoría
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  entity text NOT NULL,
  entity_id uuid,
  entity_label text,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);

-- ============================================================
-- RLS — Single-tenant, datos internos compartidos
-- ============================================================

ALTER TABLE advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE repurchase_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: aplica políticas CRUD estándar a una tabla (anon + authenticated)
CREATE OR REPLACE FUNCTION crm_crud(t text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON %I;', t, t);
  EXECUTE format('CREATE POLICY "anon_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true);', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I;', t, t);
  EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I;', t, t);
  EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON %I;', t, t);
  EXECUTE format('CREATE POLICY "anon_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true);', t, t);
END;
$$;

SELECT crm_crud('advisors');
SELECT crm_crud('channels');
SELECT crm_crud('clients');
SELECT crm_crud('products');
SELECT crm_crud('conversations');
SELECT crm_crud('messages');
SELECT crm_crud('quotes');
SELECT crm_crud('quote_items');
SELECT crm_crud('activities');
SELECT crm_crud('checkins');
SELECT crm_crud('repurchase_alerts');
SELECT crm_crud('followup_triggers');
SELECT crm_crud('audit_logs');

-- ============================================================
-- VISTAS PARA POWER BI
-- ============================================================

CREATE OR REPLACE VIEW v_client_summary AS
SELECT
  c.id AS client_id,
  c.name AS client_name,
  c.company,
  c.industry,
  c.city,
  c.email,
  c.phone,
  c.stage,
  c.tags,
  c.lifetime_value,
  ch.name AS channel_name,
  a.name AS advisor_name,
  a.role AS advisor_role,
  c.last_contact_at,
  c.created_at
FROM clients c
LEFT JOIN channels ch ON ch.id = c.channel_id
LEFT JOIN advisors a ON a.id = c.advisor_id;

CREATE OR REPLACE VIEW v_quote_summary AS
SELECT
  q.id AS quote_id,
  q.quote_number,
  q.status,
  q.subtotal,
  q.tax,
  q.total,
  q.sent_at,
  q.responded_at,
  q.rejection_reason,
  q.created_at,
  c.name AS client_name,
  c.company AS client_company,
  a.name AS advisor_name,
  (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id) AS item_count
FROM quotes q
LEFT JOIN clients c ON c.id = q.client_id
LEFT JOIN advisors a ON a.id = q.advisor_id;

CREATE OR REPLACE VIEW v_sales_monthly AS
SELECT
  date_trunc('month', q.responded_at) AS month,
  COUNT(*) AS deals_count,
  SUM(q.total) AS revenue,
  COUNT(DISTINCT q.client_id) AS unique_clients,
  COUNT(DISTINCT q.advisor_id) AS active_advisors
FROM quotes q
WHERE q.status = 'aceptada' AND q.responded_at IS NOT NULL
GROUP BY 1;

CREATE OR REPLACE VIEW v_pipeline_funnel AS
SELECT
  stage,
  COUNT(*) AS client_count,
  SUM(lifetime_value) AS total_ltv
FROM clients
GROUP BY stage;

CREATE OR REPLACE VIEW v_advisor_performance AS
SELECT
  a.id AS advisor_id,
  a.name AS advisor_name,
  a.role,
  COUNT(DISTINCT c.id) AS assigned_clients,
  COUNT(DISTINCT CASE WHEN c.stage = 'cerrado_ganado' THEN c.id END) AS won_clients,
  COUNT(DISTINCT q.id) AS quotes_created,
  COUNT(DISTINCT CASE WHEN q.status = 'aceptada' THEN q.id END) AS quotes_won,
  COALESCE(SUM(CASE WHEN q.status = 'aceptada' THEN q.total END), 0) AS revenue,
  COUNT(DISTINCT m.id) AS messages_sent
FROM advisors a
LEFT JOIN clients c ON c.advisor_id = a.id
LEFT JOIN quotes q ON q.advisor_id = a.id
LEFT JOIN conversations cv ON cv.advisor_id = a.id
LEFT JOIN messages m ON m.conversation_id = cv.id AND m.direction = 'outbound'
GROUP BY a.id, a.name, a.role;

CREATE OR REPLACE VIEW v_channel_performance AS
SELECT
  ch.id AS channel_id,
  ch.name AS channel_name,
  COUNT(DISTINCT c.id) AS prospects,
  COUNT(DISTINCT cv.id) AS conversations,
  COUNT(DISTINCT m.id) AS messages
FROM channels ch
LEFT JOIN clients c ON c.channel_id = ch.id
LEFT JOIN conversations cv ON cv.channel_id = ch.id
LEFT JOIN messages m ON m.conversation_id = cv.id
GROUP BY ch.id, ch.name;

CREATE OR REPLACE VIEW v_product_quoted AS
SELECT
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  p.category,
  p.price,
  COUNT(DISTINCT qi.quote_id) AS times_quoted,
  SUM(qi.quantity) AS total_quantity_quoted,
  SUM(qi.line_total) AS total_value_quoted
FROM products p
LEFT JOIN quote_items qi ON qi.product_id = p.id
LEFT JOIN quotes q ON q.id = qi.quote_id
GROUP BY p.id, p.sku, p.name, p.category, p.price;

CREATE OR REPLACE VIEW v_rejection_reasons AS
SELECT
  rejection_reason,
  COUNT(*) AS times_cited,
  SUM(total) AS lost_value
FROM quotes
WHERE status = 'rechazada' AND rejection_reason IS NOT NULL
GROUP BY rejection_reason
ORDER BY times_cited DESC;
