/*
# Restricción de documentos por sucursal para PROCESADOR

## Problema
La política `authenticated_read_documents` actual usa `USING (true)`,
permitiendo que cualquier usuario autenticado vea TODOS los documentos.

## Corrección
Reemplaza la política de SELECT en `documents` con una que aplique
la restricción de sucursales para el rol PROCESADOR:

| Rol           | Documentos visibles                                                |
|---------------|--------------------------------------------------------------------|
| ADMINISTRADOR | Todos                                                              |
| CONSULTOR     | Todos (solo lectura)                                               |
| CARGADOR      | Solo documentos de su sucursal asignada (profiles.branch_id)       |
| PROCESADOR    | Solo documentos de sus sucursales activamente asignadas en         |
|               | branch_processor_assignments (is_active = true)                    |

## Notas
- La restricción opera a nivel de fila en PostgreSQL (RLS), independientemente
  de la UI. Incluso si un usuario escribe la URL manualmente, la base de datos
  filtrará los datos.
- El edge function `validate-session` también retorna `assignedBranchIds`
  para que el frontend aplique filtros adicionales de UI.
*/

-- Reemplazar política SELECT de documentos
DROP POLICY IF EXISTS "authenticated_read_documents" ON documents;

CREATE POLICY "authenticated_read_documents" ON documents FOR SELECT
  TO authenticated USING (
    -- ADMINISTRADOR y CONSULTOR ven todos los documentos
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND r.name IN ('ADMINISTRADOR', 'CONSULTOR')
    )
    -- CARGADOR solo ve documentos de su sucursal asignada
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND r.name = 'CARGADOR'
        AND p.branch_id = documents.branch_id
    )
    -- PROCESADOR solo ve documentos de sus sucursales activamente asignadas
    OR EXISTS (
      SELECT 1 FROM branch_processor_assignments bpa
      JOIN profiles p ON p.id = bpa.processor_id
      JOIN roles r ON p.role_id = r.id
      WHERE bpa.processor_id = auth.uid()
        AND bpa.branch_id = documents.branch_id
        AND bpa.is_active = true
        AND r.name = 'PROCESADOR'
    )
  );

-- Mismo alcance en document_pdfs (los PDFs siguen la misma restricción que el documento)
DROP POLICY IF EXISTS "authenticated_read_pdfs" ON document_pdfs;

CREATE POLICY "authenticated_read_pdfs" ON document_pdfs FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pdfs.document_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
        WHERE p.id = auth.uid() AND r.name IN ('ADMINISTRADOR', 'CONSULTOR')
      )
      OR EXISTS (
        SELECT 1 FROM documents d
        JOIN profiles p ON p.id = auth.uid()
        JOIN roles r ON p.role_id = r.id
        WHERE d.id = document_pdfs.document_id
          AND r.name = 'CARGADOR'
          AND p.branch_id = d.branch_id
      )
      OR EXISTS (
        SELECT 1 FROM documents d
        JOIN branch_processor_assignments bpa
          ON bpa.branch_id = d.branch_id AND bpa.processor_id = auth.uid() AND bpa.is_active = true
        JOIN profiles p ON p.id = auth.uid()
        JOIN roles r ON p.role_id = r.id
        WHERE d.id = document_pdfs.document_id AND r.name = 'PROCESADOR'
      )
    )
  );
