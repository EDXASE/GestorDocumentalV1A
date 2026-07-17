import { FileText } from 'lucide-react';
import { PagePlaceholder } from '../components/PagePlaceholder';

export function DocumentDetailPage() {
  return (
    <PagePlaceholder
      title="Detalle de Documento"
      description="Vista detallada de un documento individual con PDFs, comentarios e historial"
      icon={<FileText className="w-8 h-8" />}
    />
  );
}
