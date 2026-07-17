import { useEffect, useRef, useState } from 'react';
import {
  X, FileText, Upload, CheckCircle2, AlertCircle,
  Loader2, Trash2, Calendar, Hash, FileUp, MessageSquare,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DocumentTypeCode, ProfileWithRole } from '../../types/database';

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

interface FormState {
  fecha: string;
  nombre: string;
  reference: string;
  novedades: string;
  file: File | null;
}

type UploadStep =
  | 'idle'
  | 'uploading-pdf'
  | 'saving-record'
  | 'done'
  | 'error';

const STEP_LABELS: Record<UploadStep, string> = {
  idle: '',
  'uploading-pdf': 'Subiendo PDF…',
  'saving-record': 'Guardando documento…',
  done: '¡Documento cargado exitosamente!',
  error: '',
};

function todayString() {
  return new Date().toISOString().split('T')[0];
}

export interface UploadDocumentDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profile: ProfileWithRole;
  documentTypeId: string;
  pendingStateId: string;
  documentTypeLabel: string;
  documentTypeCode: DocumentTypeCode;
  referenceLabel: string;
  referencePlaceholder: string;
}

export function UploadDocumentDrawer({
  open,
  onClose,
  onSuccess,
  profile,
  documentTypeId,
  pendingStateId,
  documentTypeLabel,
  documentTypeCode,
  referenceLabel,
  referencePlaceholder,
}: UploadDocumentDrawerProps) {
  const [form, setForm] = useState<FormState>({
    fecha: todayString(),
    nombre: '',
    reference: '',
    novedades: '',
    file: null,
  });
  const [step, setStep] = useState<UploadStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({ fecha: todayString(), nombre: '', reference: '', novedades: '', file: null });
      setStep('idle');
      setError(null);
      setTimeout(() => nombreRef.current?.focus(), 80);
    }
  }, [open]);

  const set = (k: keyof FormState, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const acceptFile = (f: File | null) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('Solo se aceptan archivos PDF.');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setError(`El archivo supera el límite de 50 MB. (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    setError(null);
    setForm((p) => ({ ...p, file: f }));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files[0] ?? null);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!form.fecha) { setError('La fecha es obligatoria.'); return; }
    if (!form.nombre.trim()) { setError('El nombre del documento es obligatorio.'); return; }
    if (!form.reference.trim()) { setError(`${referenceLabel} es obligatorio.`); return; }
    if (!form.file) { setError('El PDF es obligatorio.'); return; }
    if (!profile.branch_id) { setError('Tu cuenta no tiene sucursal asignada. Contacta al administrador.'); return; }

    const docId = crypto.randomUUID();
    const safeName = form.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${profile.branch_id}/${docId}/${safeName}`;

    try {
      // Step 1: Upload PDF to storage
      setStep('uploading-pdf');
      const { error: storageErr } = await supabase.storage
        .from('document-pdfs')
        .upload(filePath, form.file, { contentType: 'application/pdf', upsert: false });

      if (storageErr) {
        throw new Error(`Error al subir el PDF: ${storageErr.message}`);
      }

      // Step 2: Save document record and related data
      setStep('saving-record');

      // Check reference uniqueness in branch
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('branch_id', profile.branch_id)
        .eq('document_number', form.reference.trim())
        .maybeSingle();

      if (existing) {
        await supabase.storage.from('document-pdfs').remove([filePath]);
        throw new Error(`El ${referenceLabel.toLowerCase()} "${form.reference.trim()}" ya existe en tu sucursal.`);
      }

      // Insert document
      const { error: docErr } = await supabase.from('documents').insert({
        id: docId,
        document_number: form.reference.trim(),
        document_type_id: documentTypeId,
        branch_id: profile.branch_id,
        state_id: pendingStateId,
        uploaded_by: profile.id,
        document_date: form.fecha,
        description: form.nombre.trim(),
      });
      if (docErr) {
        await supabase.storage.from('document-pdfs').remove([filePath]);
        throw new Error(docErr.message);
      }

      // Insert PDF record
      await supabase.from('document_pdfs').insert({
        document_id: docId,
        file_name: form.file.name,
        file_path: filePath,
        file_size: form.file.size,
        content_type: 'application/pdf',
        uploaded_by: profile.id,
      });

      // Insert comment if provided
      if (form.novedades.trim()) {
        await supabase.from('document_comments').insert({
          document_id: docId,
          user_id: profile.id,
          comment: form.novedades.trim(),
        });
      }

      // Insert history entry
      await supabase.from('document_history').insert({
        document_id: docId,
        user_id: profile.id,
        from_state_id: null,
        to_state_id: pendingStateId,
        action: 'CREATE',
        notes: `Cargado por ${profile.full_name} desde sucursal ${profile.branch?.name ?? ''}`,
      });

      // Audit log
      await supabase.from('audit_log').insert({
        user_id: profile.id,
        action: 'UPLOAD_DOCUMENT',
        entity_type: 'document',
        entity_id: docId,
        details: {
          document_number: form.reference.trim(),
          document_type: documentTypeCode,
          branch_id: profile.branch_id,
          branch_name: profile.branch?.name,
          file_name: form.file.name,
          file_size: form.file.size,
        },
      });

      setStep('done');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1800);
    } catch (e: unknown) {
      setStep('error');
      setError(e instanceof Error ? e.message : 'Error inesperado. Intenta nuevamente.');
    }
  };

  const isSubmitting = step === 'uploading-pdf' || step === 'saving-record';
  const isDone = step === 'done';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40"
          onClick={isSubmitting || isDone ? undefined : onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Cargar Documento</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {documentTypeLabel} — {profile.branch?.name ?? 'Sin sucursal'}
              </p>
            </div>
          </div>
          {!isSubmitting && !isDone && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Done state */}
        {isDone ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-800">¡Documento cargado!</h3>
              <p className="text-sm text-slate-500 mt-1">
                El documento{' '}
                <span className="font-semibold">{form.reference}</span> fue registrado con estado{' '}
                <span className="font-semibold text-amber-600">Pendiente</span>.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Uploading overlay */}
              {isSubmitting && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-700">{STEP_LABELS[step]}</p>
                    <p className="text-xs text-blue-500 mt-0.5">Por favor, no cierre esta ventana.</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Fecha del documento <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={form.fecha}
                    max={todayString()}
                    onChange={(e) => set('fecha', e.target.value)}
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Nombre del documento */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nombre del documento <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    ref={nombreRef}
                    type="text"
                    value={form.nombre}
                    onChange={(e) => set('nombre', e.target.value)}
                    placeholder="Ej: Factura proveedor materiales"
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Reference field (comprobante / código de reposición) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {referenceLabel} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => set('reference', e.target.value)}
                    placeholder={referencePlaceholder}
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono transition disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">Debe ser único dentro de tu sucursal.</p>
              </div>

              {/* Novedades / Comentario */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                    Novedades o comentario
                    <span className="text-slate-400 font-normal">(opcional)</span>
                  </div>
                </label>
                <textarea
                  value={form.novedades}
                  onChange={(e) => set('novedades', e.target.value)}
                  placeholder="Observaciones, aclaraciones o novedades del documento…"
                  rows={3}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* PDF Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Archivo PDF <span className="text-rose-500">*</span>
                </label>

                {form.file ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{form.file.name}</p>
                      <p className="text-xs text-slate-500">
                        {(form.file.size / 1024).toFixed(0)} KB
                        {form.file.size > 1024 * 1024 && ` (${(form.file.size / 1024 / 1024).toFixed(1)} MB)`}
                      </p>
                    </div>
                    {!isSubmitting && (
                      <button
                        onClick={() => setForm((p) => ({ ...p, file: null }))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-100 transition flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition ${
                      dragOver
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition ${
                        dragOver ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    >
                      <Upload className={`w-6 h-6 ${dragOver ? 'text-white' : 'text-slate-500'}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        {dragOver ? 'Suelta el PDF aquí' : 'Arrastra el PDF o haz clic'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Solo archivos PDF — máximo 50 MB</p>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
                  : <><Upload className="w-4 h-4" /> Cargar documento</>}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
