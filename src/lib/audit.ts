import { supabase } from './supabase';
import type { Json } from './supabase';

export async function logAudit(entry: {
  actor_id?: string | null;
  actor_name?: string | null;
  action: 'create' | 'update' | 'delete';
  entity: string;
  entity_id?: string | null;
  entity_label?: string | null;
  changes?: Json;
}) {
  try {
    await supabase.from('audit_logs').insert({
      actor_id: entry.actor_id ?? null,
      actor_name: entry.actor_name ?? 'Sistema',
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id ?? null,
      entity_label: entry.entity_label ?? null,
      changes: entry.changes ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Audit log failed', e);
  }
}
