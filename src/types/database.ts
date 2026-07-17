export type RoleName =
  | 'ADMINISTRADOR'
  | 'CARGADOR'
  | 'PROCESADOR'
  | 'CONSULTOR';

export type DocumentTypeCode = 'CAJA_GENERAL' | 'CAJA_CHICA';

export type DocumentStateCode =
  | 'PENDIENTE'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'ANULADO';

export type HistoryAction =
  | 'CREATE'
  | 'APPROVE'
  | 'REJECT'
  | 'ANNUL'
  | 'ASSIGN'
  | 'UPDATE';

export interface Role {
  id: string;
  name: RoleName;
  description: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  role_id: string;
  branch_id: string | null;
  full_name: string;
  username: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role?: Role;
  branch?: Branch | null;
}

export interface BranchProcessorAssignment {
  id: string;
  processor_id: string;
  branch_id: string;
  is_active: boolean;
  can_caja_general: boolean;
  can_caja_chica: boolean;
  assigned_at: string;
  processor?: Profile;
  branch?: Branch;
}

export interface DocumentType {
  id: string;
  code: DocumentTypeCode;
  name: string;
  description: string | null;
  created_at: string;
}

export interface DocumentState {
  id: string;
  code: DocumentStateCode;
  name: string;
  description: string | null;
  is_terminal: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  document_number: string;
  document_type_id: string;
  branch_id: string;
  state_id: string;
  uploaded_by: string;
  processed_by: string | null;
  document_date: string;
  amount: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  document_type?: DocumentType;
  branch?: Branch;
  state?: DocumentState;
  uploader?: Profile;
  processor?: Profile | null;
}

export interface DocumentPdf {
  id: string;
  document_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string;
  uploaded_by: string;
  created_at: string;
  uploader?: Profile;
}

export interface DocumentComment {
  id: string;
  document_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user?: Profile;
}

export interface DocumentHistoryEntry {
  id: string;
  document_id: string;
  user_id: string;
  from_state_id: string | null;
  to_state_id: string | null;
  action: HistoryAction | string;
  notes: string | null;
  created_at: string;
  user?: Profile;
  from_state?: DocumentState | null;
  to_state?: DocumentState | null;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: Profile | null;
}

export interface ProfileWithRole extends Profile {
  role: Role;
  branch: Branch | null;
}
