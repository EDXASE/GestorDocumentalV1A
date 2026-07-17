import { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import facturaEjemplo from '../assets/factura-ejemplo.png';

type InvoiceStatus = 'PENDIENTE' | 'APROBADA';

type InvoiceRow = {
  id: number;
  date: string;
  name: string;
  number: string;
  status: InvoiceStatus;
};

const DEMO_INVOICES: InvoiceRow[] = [
  { id: 1, date: '08 jul 2026', name: 'Factura Proveedor A', number: '4365', status: 'PENDIENTE' },
  { id: 2, date: '08 jul 2026', name: 'Factura Servicios B', number: '123', status: 'APROBADA' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const cls = status === 'APROBADA'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{status === 'APROBADA' ? 'Aprobada' : 'Pendiente'}</span>;
}

interface UploadDrawerProps {
  open: boolean;
  onClose: () => void;
  onExtracted: () => void;
}

function UploadDrawer({ open, onClose, onExtracted }: UploadDrawerProps) {
  const { profile } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayIso());
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);

  const selectFile = (next: File | null) => {
    if (!next) return;
    const allowed = ['application/pdf', 'application/xml', 'text/xml'];
    if (!allowed.includes(next.type) && !/\.(pdf|xml)$/i.test(next.name)) return;
    setFile(next);
    setExtracting(true);
    window.setTimeout(() => {
      setExtracting(false);
      onExtracted();
    }, 900);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/45" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[500px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
              <FileUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Cargar Documento</h2>
              <p className="text-xs text-slate-500">Caja General — {profile?.branch?.name ?? 'Santo Domingo3'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha del documento <span className="text-rose-500">*</span></label>
          <div className="relative mb-5">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Archivo PDF o XML <span className="text-rose-500">*</span></label>
          <input ref={fileInput} type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml" className="hidden" onChange={(e) => selectFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files?.[0] ?? null); }}
            className="flex h-48 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-center hover:border-blue-400 hover:bg-blue-50/30"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Upload className="h-5 w-5 text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Arrastra el PDF o XML o haz clic</p>
            <p className="mt-1 text-xs text-slate-400">Solo archivos PDF o XML — máximo 10 MB</p>
            {file && <p className="mt-3 max-w-[85%] truncate text-xs font-medium text-blue-600">{file.name}</p>}
          </button>

          {extracting && (
            <div className="mt-5">
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Extrayendo información...
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-500" />
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre del proveedor</label>
              <input disabled placeholder="Nombre del proveedor (extraído automáticamente)" className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-400" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Monto Total</label>
              <input disabled placeholder="Monto Total" className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-400" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button disabled={!file || extracting} onClick={onExtracted} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" /> Cargar
          </button>
        </div>
      </aside>
    </>
  );
}

interface ExtractionModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

function ExtractionModal({ open, onClose, onSave }: ExtractionModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/45">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[1080px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Extracción de Datos de Factura</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[46%_54%]">
          <div className="overflow-y-auto bg-slate-100 p-5">
            <img src={facturaEjemplo} alt="Factura de ejemplo" className="mx-auto w-full max-w-[520px] rounded-xl border border-slate-300 bg-white shadow" />
          </div>
          <div className="overflow-y-auto p-6">
            <SectionTitle>Datos del Emisor:</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="RUC Emisor" defaultValue="1791287541001" />
              <Field label="Razón Social Emisor" defaultValue="MEGADATOS SA" />
              <div className="col-span-2"><Field label="Dirección Matriz" defaultValue="NUNEZ DE VELA E313 Y ATAHUALPA, QUITO" /></div>
            </div>

            <SectionTitle>Datos del Receptor:</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="RUC Receptor" defaultValue="1717521817001" />
              <Field label="Razón Social Receptor" defaultValue="EDUARDO XAVIER SEGURA BRIONES" />
            </div>

            <SectionTitle>Detalles de la Factura:</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de Emisión" defaultValue="01/07/2026" />
              <Field label="Nro. de Factura" defaultValue="001-012-023435842" />
              <Field label="Número de Autorización (49 dígitos)" defaultValue="0107202601179128754100120010120234358421791882710" />
              <Field label="Establecimiento / Punto de Emisión" defaultValue="001 / 012" />
              <SelectField label="Concepto de Pago" defaultValue="Servicios de Internet" />
              <Field label="Clave de Acceso" defaultValue="0107202601179128754100120010120234358421791882710" />
            </div>

            <SectionTitle>Valores y Desglose:</SectionTitle>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Valor sin IVA" defaultValue="$29.99" />
              <Field label="IVA (15%)" defaultValue="$4.50" />
              <Field label="ICE / Otros" defaultValue="$0.00" />
              <Field label="Valor Total" defaultValue="$34.49" />
            </div>

            <SectionTitle>Campos de Usuario:</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Días para pago" defaultValue="15" />
              <Field label="Observaciones de Pago" defaultValue="Servicio mensual de internet corporativo." />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button onClick={onSave} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Validar y Guardar</button>
          <button onClick={onClose} className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100">Rechazar Extracción</button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-5 border-b border-slate-200 pb-2 text-sm font-bold text-slate-900 first:mt-0">{children}</h3>;
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
      <input defaultValue={defaultValue} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500" />
    </label>
  );
}

function SelectField({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
      <select defaultValue={defaultValue} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500">
        <option>{defaultValue}</option>
        <option>Servicios profesionales</option>
        <option>Compra de bienes</option>
      </select>
    </label>
  );
}

export function FacturasPage() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [extractionOpen, setExtractionOpen] = useState(false);
  const [invoices, setInvoices] = useState(DEMO_INVOICES);
  const [toast, setToast] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((row) => row.name.toLowerCase().includes(q) || row.number.includes(q));
  }, [invoices, search]);

  const stats = {
    total: invoices.length,
    pending: invoices.filter((x) => x.status === 'PENDIENTE').length,
    approved: invoices.filter((x) => x.status === 'APROBADA').length,
    rejected: 0,
  };

  const saveExtraction = () => {
    setInvoices((prev) => [
      { id: Date.now(), date: '13 jul 2026', name: 'MEGADATOS SA — Internet', number: '001-012-023435842', status: 'PENDIENTE' },
      ...prev,
    ]);
    setExtractionOpen(false);
    setDrawerOpen(false);
    setToast('Factura validada y guardada correctamente.');
    window.setTimeout(() => setToast(''), 3500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Facturas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Total documentos cargados <span className="ml-1 text-xs">{profile?.branch?.name ?? 'Santo Domingo3'}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-slate-300 p-2.5 text-slate-600 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Cargar Documento</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Mis facturas', stats.total, 'bg-white text-slate-800'],
          ['Pendientes', stats.pending, 'bg-amber-50 text-amber-700'],
          ['Aprobados', stats.approved, 'bg-emerald-50 text-emerald-700'],
          ['Rechazados', stats.rejected, 'bg-rose-50 text-rose-700'],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={`rounded-xl border border-slate-200 px-4 py-3 ${cls}`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por comprobante o nombre..." className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" /></div>
        <button className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Filter className="h-4 w-4" /> Filtros</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"><FileText className="h-4 w-4" /> Mis Documentos</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Comprobante</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Registrado</th><th className="px-4 py-3 text-center">PDF</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row, index) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500">{index + 1}</td><td className="px-4 py-3 text-slate-600">{row.date}</td><td className="px-4 py-3"><div className="flex items-center gap-2 font-medium text-slate-700"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50"><FileText className="h-3.5 w-3.5 text-blue-600" /></span>{row.name}</div></td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{row.number}</span></td><td className="px-4 py-3"><StatusPill status={row.status} /></td><td className="px-4 py-3 text-slate-500">{row.date}</td><td className="px-4 py-3 text-center"><button className="rounded p-2 text-blue-600 hover:bg-blue-50"><Download className="h-4 w-4" /></button></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <div className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg"><CheckCircle2 className="h-4 w-4" />{toast}</div>}

      <UploadDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onExtracted={() => setExtractionOpen(true)} />
      <ExtractionModal open={extractionOpen} onClose={() => setExtractionOpen(false)} onSave={saveExtraction} />
    </div>
  );
}

export default FacturasPage;
