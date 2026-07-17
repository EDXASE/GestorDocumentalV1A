/*
# CRM Omnicanal — Datos Semilla Iniciales

## Resumen
Puebla la base de datos con datos demo realistas para que el CRM sea funcional
inmediatamente: canales, asesores, productos, clientes, conversaciones, mensajes,
cotizaciones, actividades, check-ins, alertas y logs de auditoría.

## Datos incluidos
1. 3 canales digitales (WhatsApp, Messenger, Instagram)
2. 5 asesores (1 gerente, 4 asesores)
3. 12 productos en 4 categorías
4. 18 clientes distribuidos en etapas del embudo
5. Conversaciones y mensajes con resúmenes de IA
6. 8 cotizaciones en distintos estados
7. Actividades, check-ins, alertas de re-compra y triggers de seguimiento
8. Logs de auditoría de ejemplo

## Notas
- Usa UUIDs hex válidos (prefijo 0e + ceros).
- Timestamps distribuidos en los últimos 60 días.
- `updated_at` de clients se mantiene sincronizado vía trigger.
*/

-- Trigger para mantener updated_at en clients
CREATE OR REPLACE FUNCTION touch_client_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_client ON clients;
CREATE TRIGGER trg_touch_client BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION touch_client_updated_at();

-- ============================================================
-- CANALES
-- ============================================================
INSERT INTO channels (name, slug, color) VALUES
  ('WhatsApp Business', 'whatsapp', '#25D366'),
  ('Facebook Messenger', 'messenger', '#0084FF'),
  ('Instagram Direct', 'instagram', '#E1306C')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- ASESORES
-- ============================================================
INSERT INTO advisors (name, email, phone, role, avatar_color) VALUES
  ('Laura Méndez', 'laura@crmcorp.com', '+52 55 1234 5601', 'gerente', '#1e6091'),
  ('Carlos Ruiz', 'carlos@crmcorp.com', '+52 55 1234 5602', 'asesor', '#2a9d8f'),
  ('Ana Torres', 'ana@crmcorp.com', '+52 55 1234 5603', 'asesor', '#e76f51'),
  ('Jorge Vidal', 'jorge@crmcorp.com', '+52 55 1234 5604', 'asesor', '#6a4c93'),
  ('Sofía Castro', 'sofia@crmcorp.com', '+52 55 1234 5605', 'asesor', '#f4a261')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- PRODUCTOS
-- ============================================================
INSERT INTO products (sku, name, category, price, stock) VALUES
  ('SKU-001', 'Laptop Pro 14"', 'Cómputo', 24500, 32),
  ('SKU-002', 'Monitor 27" 4K', 'Cómputo', 8900, 54),
  ('SKU-003', 'Teclado Mecánico RGB', 'Accesorios', 1450, 120),
  ('SKU-004', 'Mouse Inalámbrico Ergo', 'Accesorios', 720, 200),
  ('SKU-005', 'Silla Ergonómica Ejecutiva', 'Mobiliario', 6800, 18),
  ('SKU-006', 'Escritorio Ajustable', 'Mobiliario', 5400, 22),
  ('SKU-007', 'Audífonos ANC Pro', 'Accesorios', 3200, 75),
  ('SKU-008', 'Servidor Rack 2U', 'Infraestructura', 48500, 6),
  ('SKU-009', 'Switch 24 Puertos', 'Infraestructura', 4200, 14),
  ('SKU-010', 'UPS 1500VA', 'Infraestructura', 3800, 20),
  ('SKU-011', 'Webcam 4K Pro', 'Accesorios', 2100, 90),
  ('SKU-012', 'Tablet 11" 256GB', 'Cómputo', 12800, 40)
ON CONFLICT (sku) DO NOTHING;

-- ============================================================
-- CLIENTES
-- ============================================================
INSERT INTO clients (id, name, company, email, phone, industry, city, channel_id, advisor_id, stage, tags, lifetime_value, last_contact_at, notes, created_at) VALUES
  ('0e000001-0000-0000-0000-000000000001', 'Roberto Aguilar', 'Grupo Industrial Aguilar', 'roberto@aguilar.com', '+52 55 8800 1100', 'Manufactura', 'Monterrey', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'negociacion', ARRAY['VIP','Industrial','WhatsApp'], 145000, now() - interval '2 days', 'Cliente recurrente, sensible a precio.', now() - interval '40 days'),
  ('0e000001-0000-0000-0000-000000000002', 'Mariana López', 'López & Asociados', 'mariana@lopez.com', '+52 55 8800 1101', 'Servicios', 'CDMX', (SELECT id FROM channels WHERE slug='messenger'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'cotizacion_enviada', ARRAY['Servicios','Recompra'], 62000, now() - interval '5 days', 'Cotización pendiente de respuesta.', now() - interval '30 days'),
  ('0e000001-0000-0000-0000-000000000003', 'Fernando Díaz', 'Díaz Logística', 'fernando@diazlog.com', '+52 55 8800 1102', 'Logística', 'Guadalajara', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), 'contacto_inicial', ARRAY['Prospecto','Logística'], 0, now() - interval '1 day', 'Primer contacto, evalúa proveedores.', now() - interval '3 days'),
  ('0e000001-0000-0000-0000-000000000004', 'Patricia Romero', 'Romero Construcciones', 'patricia@romero.com', '+52 55 8800 1103', 'Construcción', 'Puebla', (SELECT id FROM channels WHERE slug='instagram'), (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), 'cerrado_ganado', ARRAY['VIP','Construcción'], 285000, now() - interval '7 days', 'Cerró paquete completo de infraestructura.', now() - interval '60 days'),
  ('0e000001-0000-0000-0000-000000000005', 'Eduardo Vega', 'Vega Retail', 'eduardo@vega.com', '+52 55 8800 1104', 'Retail', 'Querétaro', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'negociacion', ARRAY['Retail','Recompra'], 98000, now() - interval '3 days', 'Negociando descuento por volumen.', now() - interval '25 days'),
  ('0e000001-0000-0000-0000-000000000006', 'Lucía Herrera', 'Herrera & Hijos', 'lucia@herrera.com', '+52 55 8800 1105', 'Manufactura', 'San Luis Potosí', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'cotizacion_enviada', ARRAY['Industrial'], 41000, now() - interval '4 days', 'Esperando aprobación interna.', now() - interval '20 days'),
  ('0e000001-0000-0000-0000-000000000007', 'Diego Mora', 'Mora Tech', 'diego@moratech.com', '+52 55 8800 1106', 'Tecnología', 'CDMX', (SELECT id FROM channels WHERE slug='messenger'), (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), 'contacto_inicial', ARRAY['Startup','Tecnología'], 0, now() - interval '6 hours', 'Lead entrante por campaña.', now() - interval '1 day'),
  ('0e000001-0000-0000-0000-000000000008', 'Carolina Páez', 'Páez Distribución', 'carolina@paez.com', '+52 55 8800 1107', 'Distribución', 'Toluca', (SELECT id FROM channels WHERE slug='instagram'), (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), 'negociacion', ARRAY['VIP','Distribución'], 178000, now() - interval '2 days', 'Renovación anual próxima.', now() - interval '45 days'),
  ('0e000001-0000-0000-0000-000000000009', 'Manuel Ortega', 'Ortega Servicios', 'manuel@ortega.com', '+52 55 8800 1108', 'Servicios', 'Morelia', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'cerrado_perdido', ARRAY['Servicios'], 0, now() - interval '15 days', 'Elegió proveedor competidor por precio.', now() - interval '50 days'),
  ('0e000001-0000-0000-0000-000000000010', 'Valeria Soto', 'Soto Corporativo', 'valeria@soto.com', '+52 55 8800 1109', 'Corporativo', 'Monterrey', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'cotizacion_enviada', ARRAY['VIP','Corporativo'], 220000, now() - interval '1 day', 'Decisión esperada esta semana.', now() - interval '15 days'),
  ('0e000001-0000-0000-0000-000000000011', 'Andrés Ríos', 'Ríos Comercial', 'andres@rios.com', '+52 55 8800 1110', 'Retail', 'Veracruz', (SELECT id FROM channels WHERE slug='messenger'), (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), 'contacto_inicial', ARRAY['Retail'], 0, now() - interval '8 hours', 'Solicita catálogo completo.', now() - interval '2 days'),
  ('0e000001-0000-0000-0000-000000000012', 'Gabriela Núñez', 'Núñez Pharma', 'gabriela@nunez.com', '+52 55 8800 1111', 'Farmacéutica', 'CDMX', (SELECT id FROM channels WHERE slug='instagram'), (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), 'negociacion', ARRAY['VIP','Farmacéutica'], 312000, now() - interval '3 days', 'Cuenta estratégica, alta sensibilidad.', now() - interval '55 days'),
  ('0e000001-0000-0000-0000-000000000013', 'Ricardo Peña', 'Peña Automotriz', 'ricardo@pena.com', '+52 55 8800 1112', 'Automotriz', 'Saltillo', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'cerrado_ganado', ARRAY['Industrial','Automotriz'], 198000, now() - interval '10 days', 'Implementación en curso.', now() - interval '35 days'),
  ('0e000001-0000-0000-0000-000000000014', 'Isabel Cruz', 'Cruz Consultores', 'isabel@cruz.com', '+52 55 8800 1113', 'Consultoría', 'CDMX', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'cotizacion_enviada', ARRAY['Servicios'], 54000, now() - interval '6 days', 'Esperando reunión de aprobación.', now() - interval '18 days'),
  ('0e000001-0000-0000-0000-000000000015', 'Tomás Vargas', 'Vargas Energía', 'tomas@vargas.com', '+52 55 8800 1114', 'Energía', 'Tampico', (SELECT id FROM channels WHERE slug='messenger'), (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), 'negociacion', ARRAY['Industrial','Energía'], 167000, now() - interval '4 days', 'Negociando condiciones de pago.', now() - interval '28 days'),
  ('0e000001-0000-0000-0000-000000000016', 'Paula Medina', 'Medina Alimentos', 'paula@medina.com', '+52 55 8800 1115', 'Alimentos', 'León', (SELECT id FROM channels WHERE slug='instagram'), (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), 'contacto_inicial', ARRAY['Prospecto','Alimentos'], 0, now() - interval '12 hours', 'Interesada en equipamiento nuevo.', now() - interval '4 days'),
  ('0e000001-0000-0000-0000-000000000017', 'Hugo Beltrán', 'Beltrán Hnos', 'hugo@beltran.com', '+52 55 8800 1116', 'Manufactura', 'Monterrey', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'cerrado_ganado', ARRAY['VIP','Industrial'], 245000, now() - interval '20 days', 'Cliente leal desde 2022.', now() - interval '90 days'),
  ('0e000001-0000-0000-0000-000000000018', 'Daniela Cortés', 'Cortés Diseño', 'daniela@cortes.com', '+52 55 8800 1117', 'Diseño', 'Guadalajara', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'cotizacion_enviada', ARRAY['Servicios','Diseño'], 38000, now() - interval '2 days', 'Cotización enviada hace 2 días, sin respuesta.', now() - interval '12 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CONVERSACIONES Y MENSAJES
-- ============================================================
INSERT INTO conversations (id, client_id, channel_id, advisor_id, status, last_message_at, unread_count, ai_summary, created_at) VALUES
  ('0e000002-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'open', now() - interval '30 minutes', 2, 'Cliente solicita descuento adicional por volumen. Interesado en cerrar esta semana.', now() - interval '40 days'),
  ('0e000002-0000-0000-0000-000000000002', '0e000001-0000-0000-0000-000000000002', (SELECT id FROM channels WHERE slug='messenger'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'pending', now() - interval '5 days', 0, 'Cotización enviada, cliente en revisión interna. Pendiente respuesta.', now() - interval '30 days'),
  ('0e000002-0000-0000-0000-000000000003', '0e000001-0000-0000-0000-000000000003', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), 'open', now() - interval '1 hour', 1, 'Primer contacto, cliente evalúa proveedores. Solicita propuesta.', now() - interval '3 days'),
  ('0e000002-0000-0000-0000-000000000004', '0e000001-0000-0000-0000-000000000007', (SELECT id FROM channels WHERE slug='messenger'), (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), 'open', now() - interval '20 minutes', 3, 'Lead entrante por campaña. Solicita demo y precios.', now() - interval '1 day'),
  ('0e000002-0000-0000-0000-000000000005', '0e000001-0000-0000-0000-000000000010', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'open', now() - interval '2 hours', 1, 'Decisión esperada esta semana. Cliente VIP corporativo.', now() - interval '15 days'),
  ('0e000002-0000-0000-0000-000000000006', '0e000001-0000-0000-0000-000000000018', (SELECT id FROM channels WHERE slug='whatsapp'), (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'pending', now() - interval '2 days', 0, 'Cotización enviada hace 48h. Sin respuesta. Activar seguimiento.', now() - interval '12 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (conversation_id, body, direction, sender, ai_suggested, created_at) VALUES
  ('0e000002-0000-0000-0000-000000000001', 'Hola Roberto, ¿cómo le va? Le comparto la cotización actualizada.', 'outbound', 'advisor', false, now() - interval '2 days'),
  ('0e000002-0000-0000-0000-000000000001', 'Gracias Carlos. ¿Podrían mejorar el precio si cerramos 50 unidades?', 'inbound', 'client', false, now() - interval '1 day'),
  ('0e000002-0000-0000-0000-000000000001', 'Déjame consultarlo con mi gerente y le confirmo.', 'outbound', 'advisor', false, now() - interval '20 hours'),
  ('0e000002-0000-0000-0000-000000000001', 'Claro, espero su respuesta. Necesito cerrar esta semana.', 'inbound', 'client', false, now() - interval '30 minutes'),
  ('0e000002-0000-0000-0000-000000000001', 'Podemos ofrecer 8% adicional por volumen. ¿Le parece bien?', 'outbound', 'ai', true, now() - interval '25 minutes'),
  ('0e000002-0000-0000-0000-000000000003', 'Buenas tardes, vi su anuncio. Necesito equipar mi oficina.', 'inbound', 'client', false, now() - interval '1 day'),
  ('0e000002-0000-0000-0000-000000000003', '¡Hola Fernando! Con gusto le ayudo. ¿Qué equipos tiene en mente?', 'outbound', 'ai', true, now() - interval '23 hours'),
  ('0e000002-0000-0000-0000-000000000003', 'Necesito 5 laptops, 5 monitores y sillas ergonómicas.', 'inbound', 'client', false, now() - interval '1 hour'),
  ('0e000002-0000-0000-0000-000000000004', 'Hola, vi su campaña en Instagram. ¿Tienen demo disponible?', 'inbound', 'client', false, now() - interval '20 minutes'),
  ('0e000002-0000-0000-0000-000000000005', 'Ana, ya tenemos la propuesta. La revisamos en comité el viernes.', 'inbound', 'client', false, now() - interval '2 hours'),
  ('0e000002-0000-0000-0000-000000000006', 'Hola Daniela, le comparto la cotización para su proyecto.', 'outbound', 'advisor', false, now() - interval '2 days'),
  ('0e000002-0000-0000-0000-000000000006', 'Gracias, la reviso y le aviso.', 'inbound', 'client', false, now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- COTIZACIONES
-- ============================================================
INSERT INTO quotes (id, quote_number, client_id, advisor_id, status, subtotal, tax_rate, tax, total, sent_at, responded_at, rejection_reason, created_at) VALUES
  ('0e000003-0000-0000-0000-000000000001', 'COT-2026-0001', '0e000001-0000-0000-0000-000000000001', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'enviada', 95000, 0.16, 15200, 110200, now() - interval '2 days', NULL, NULL, now() - interval '3 days'),
  ('0e000003-0000-0000-0000-000000000002', 'COT-2026-0002', '0e000001-0000-0000-0000-000000000002', (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'enviada', 42000, 0.16, 6720, 48720, now() - interval '5 days', NULL, NULL, now() - interval '6 days'),
  ('0e000003-0000-0000-0000-000000000003', 'COT-2026-0003', '0e000001-0000-0000-0000-000000000004', (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), 'aceptada', 245000, 0.16, 39200, 284200, now() - interval '50 days', now() - interval '40 days', NULL, now() - interval '55 days'),
  ('0e000003-0000-0000-0000-000000000004', 'COT-2026-0004', '0e000001-0000-0000-0000-000000000005', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'enviada', 68000, 0.16, 10880, 78880, now() - interval '3 days', NULL, NULL, now() - interval '4 days'),
  ('0e000003-0000-0000-0000-000000000005', 'COT-2026-0005', '0e000001-0000-0000-0000-000000000009', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'rechazada', 54000, 0.16, 8640, 62640, now() - interval '45 days', now() - interval '15 days', 'Precio por encima del competidor', now() - interval '50 days'),
  ('0e000003-0000-0000-0000-000000000006', 'COT-2026-0006', '0e000001-0000-0000-0000-000000000010', (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'enviada', 180000, 0.16, 28800, 208800, now() - interval '1 day', NULL, NULL, now() - interval '2 days'),
  ('0e000003-0000-0000-0000-000000000007', 'COT-2026-0007', '0e000001-0000-0000-0000-000000000013', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'aceptada', 165000, 0.16, 26400, 191400, now() - interval '30 days', now() - interval '10 days', NULL, now() - interval '35 days'),
  ('0e000003-0000-0000-0000-000000000008', 'COT-2026-0008', '0e000001-0000-0000-0000-000000000018', (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'enviada', 32000, 0.16, 5120, 37120, now() - interval '2 days', NULL, NULL, now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO quote_items (quote_id, product_id, product_name, quantity, unit_price, discount) VALUES
  ('0e000003-0000-0000-0000-000000000001', (SELECT id FROM products WHERE sku='SKU-001'), 'Laptop Pro 14"', 3, 24500, 5),
  ('0e000003-0000-0000-0000-000000000001', (SELECT id FROM products WHERE sku='SKU-002'), 'Monitor 27" 4K', 3, 8900, 0),
  ('0e000003-0000-0000-0000-000000000002', (SELECT id FROM products WHERE sku='SKU-005'), 'Silla Ergonómica Ejecutiva', 5, 6800, 10),
  ('0e000003-0000-0000-0000-000000000003', (SELECT id FROM products WHERE sku='SKU-008'), 'Servidor Rack 2U', 4, 48500, 5),
  ('0e000003-0000-0000-0000-000000000003', (SELECT id FROM products WHERE sku='SKU-009'), 'Switch 24 Puertos', 4, 4200, 0),
  ('0e000003-0000-0000-0000-000000000003', (SELECT id FROM products WHERE sku='SKU-010'), 'UPS 1500VA', 4, 3800, 0),
  ('0e000003-0000-0000-0000-000000000004', (SELECT id FROM products WHERE sku='SKU-012'), 'Tablet 11" 256GB', 5, 12800, 0),
  ('0e000003-0000-0000-0000-000000000005', (SELECT id FROM products WHERE sku='SKU-005'), 'Silla Ergonómica Ejecutiva', 8, 6800, 0),
  ('0e000003-0000-0000-0000-000000000006', (SELECT id FROM products WHERE sku='SKU-001'), 'Laptop Pro 14"', 5, 24500, 8),
  ('0e000003-0000-0000-0000-000000000006', (SELECT id FROM products WHERE sku='SKU-007'), 'Audífonos ANC Pro', 5, 3200, 0),
  ('0e000003-0000-0000-0000-000000000007', (SELECT id FROM products WHERE sku='SKU-001'), 'Laptop Pro 14"', 4, 24500, 5),
  ('0e000003-0000-0000-0000-000000000007', (SELECT id FROM products WHERE sku='SKU-002'), 'Monitor 27" 4K', 4, 8900, 0),
  ('0e000003-0000-0000-0000-000000000007', (SELECT id FROM products WHERE sku='SKU-005'), 'Silla Ergonómica Ejecutiva', 4, 6800, 0),
  ('0e000003-0000-0000-0000-000000000008', (SELECT id FROM products WHERE sku='SKU-011'), 'Webcam 4K Pro', 8, 2100, 0),
  ('0e000003-0000-0000-0000-000000000008', (SELECT id FROM products WHERE sku='SKU-003'), 'Teclado Mecánico RGB', 8, 1450, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ACTIVIDADES
-- ============================================================
INSERT INTO activities (title, type, client_id, advisor_id, scheduled_at, duration_min, location, status, notes) VALUES
  ('Llamada de seguimiento Roberto', 'llamada', '0e000001-0000-0000-0000-000000000001', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), now() + interval '2 hours', 30, NULL, 'pendiente', 'Confirmar descuento por volumen'),
  ('Visita oficinas Mora Tech', 'visita', '0e000001-0000-0000-0000-000000000007', (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), now() + interval '1 day', 90, 'Av. Reforma 123, CDMX', 'pendiente', 'Demo de productos en sitio'),
  ('Reunión cierre Soto Corporativo', 'reunion', '0e000001-0000-0000-0000-000000000010', (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), now() + interval '3 days', 60, 'Oficinas cliente', 'pendiente', 'Presentación a comité de compras'),
  ('Llamada Valeria Soto', 'llamada', '0e000001-0000-0000-0000-000000000010', (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), now() - interval '1 day', 20, NULL, 'completada', 'Confirmó recepción de propuesta'),
  ('Visita Grupo Industrial Aguilar', 'visita', '0e000001-0000-0000-0000-000000000001', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), now() - interval '5 days', 120, 'Planta Monterrey', 'completada', 'Recorrido por instalaciones'),
  ('Tarea: enviar catálogo a Ríos', 'tarea', '0e000001-0000-0000-0000-000000000011', (SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), now() + interval '4 hours', 15, NULL, 'pendiente', 'Catálogo completo en PDF'),
  ('Reunión equipo comercial', 'reunion', NULL, (SELECT id FROM advisors WHERE email='laura@crmcorp.com'), now() + interval '2 days', 60, 'Oficina central', 'pendiente', 'Revisión semanal de pipeline'),
  ('Llamada seguimiento Cortés', 'llamada', '0e000001-0000-0000-0000-000000000018', (SELECT id FROM advisors WHERE email='ana@crmcorp.com'), now() + interval '6 hours', 20, NULL, 'pendiente', 'Cotización sin respuesta 48h')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CHECK-INS
-- ============================================================
INSERT INTO checkins (advisor_id, client_id, activity_id, latitude, longitude, address, notes, created_at) VALUES
  ((SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), '0e000001-0000-0000-0000-000000000001', NULL, 25.6866, -100.3161, 'Planta Grupo Industrial Aguilar, Monterrey', 'Visita completada, cliente receptivo.', now() - interval '5 days'),
  ((SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), '0e000001-0000-0000-0000-000000000004', NULL, 19.0414, -98.2063, 'Oficinas Romero Construcciones, Puebla', 'Cierre de paquete infraestructura.', now() - interval '40 days'),
  ((SELECT id FROM advisors WHERE email='jorge@crmcorp.com'), '0e000001-0000-0000-0000-000000000003', NULL, 20.6597, -103.3496, 'Bodega Díaz Logística, Guadalajara', 'Primer contacto en sitio.', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ALERTAS DE RE-COMPRA
-- ============================================================
INSERT INTO repurchase_alerts (client_id, advisor_id, product_id, product_name, expected_date, last_purchase_date, cycle_days, status, notes) VALUES
  ('0e000001-0000-0000-0000-000000000004', (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), (SELECT id FROM products WHERE sku='SKU-008'), 'Servidor Rack 2U', (CURRENT_DATE + 20), (CURRENT_DATE - 40), 60, 'activa', 'Renovación de servidor próxima'),
  ('0e000001-0000-0000-0000-000000000008', (SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), (SELECT id FROM products WHERE sku='SKU-001'), 'Laptop Pro 14"', (CURRENT_DATE + 10), (CURRENT_DATE - 50), 60, 'activa', 'Reemplazo de flota anual'),
  ('0e000001-0000-0000-0000-000000000013', (SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), (SELECT id FROM products WHERE sku='SKU-005'), 'Silla Ergonómica Ejecutiva', (CURRENT_DATE + 5), (CURRENT_DATE - 25), 30, 'activa', 'Reposición de sillas')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TRIGGERS DE SEGUIMIENTO
-- ============================================================
INSERT INTO followup_triggers (quote_id, client_id, trigger_at, message, status) VALUES
  ('0e000003-0000-0000-0000-000000000002', '0e000001-0000-0000-0000-000000000002', now() + interval '12 hours', 'Hola Mariana, le doy seguimiento a la cotización COT-2026-0002. ¿Tiene alguna duda?', 'programado'),
  ('0e000003-0000-0000-0000-000000000008', '0e000001-0000-0000-0000-000000000018', now() - interval '1 hour', 'Hola Daniela, le recuerdo la cotización COT-2026-0008. Quedo atento a sus comentarios.', 'programado')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- LOGS DE AUDITORÍA
-- ============================================================
INSERT INTO audit_logs (actor_id, actor_name, action, entity, entity_id, entity_label, changes, created_at) VALUES
  ((SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'Carlos Ruiz', 'create', 'quote', '0e000003-0000-0000-0000-000000000001', 'COT-2026-0001', '{"total": 110200}'::jsonb, now() - interval '3 days'),
  ((SELECT id FROM advisors WHERE email='sofia@crmcorp.com'), 'Sofía Castro', 'update', 'client', '0e000001-0000-0000-0000-000000000004', 'Patricia Romero', '{"stage": ["negociacion","cerrado_ganado"]}'::jsonb, now() - interval '40 days'),
  ((SELECT id FROM advisors WHERE email='ana@crmcorp.com'), 'Ana Torres', 'create', 'quote', '0e000003-0000-0000-0000-000000000006', 'COT-2026-0006', '{"total": 208800}'::jsonb, now() - interval '2 days'),
  ((SELECT id FROM advisors WHERE email='carlos@crmcorp.com'), 'Carlos Ruiz', 'update', 'client', '0e000001-0000-0000-0000-000000000001', 'Roberto Aguilar', '{"stage": ["cotizacion_enviada","negociacion"]}'::jsonb, now() - interval '1 day'),
  ((SELECT id FROM advisors WHERE email='laura@crmcorp.com'), 'Laura Méndez', 'create', 'activity', NULL, 'Reunión equipo comercial', '{"type": "reunion"}'::jsonb, now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;
