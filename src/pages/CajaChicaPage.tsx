import { CajaDocumentPage } from './caja-shared/CajaDocumentPage';
import type { CajaDocumentPageConfig } from './caja-shared/CajaDocumentPage';

const config: CajaDocumentPageConfig = {
  title: 'Caja Chica',
  documentTypeCode: 'CAJA_CHICA',
  referenceLabel: 'Código de reposición',
  referencePlaceholder: 'Ej: R-001',
  searchPlaceholder: 'Buscar por código o nombre…',
  tableColumnHeader: 'Código',
};

export function CajaChicaPage() {
  return <CajaDocumentPage config={config} />;
}
