import { CajaDocumentPage } from './caja-shared/CajaDocumentPage';
import type { CajaDocumentPageConfig } from './caja-shared/CajaDocumentPage';

const config: CajaDocumentPageConfig = {
  title: 'Caja General',
  documentTypeCode: 'CAJA_GENERAL',
  referenceLabel: 'Número de comprobante',
  referencePlaceholder: 'Ej: F-00123',
  searchPlaceholder: 'Buscar por comprobante o nombre…',
  tableColumnHeader: 'Comprobante',
};

export function CajaGeneralPage() {
  return <CajaDocumentPage config={config} />;
}
