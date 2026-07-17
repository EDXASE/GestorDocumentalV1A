import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { zipSync } from "npm:fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 50)
    .replace(/^_|_$/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Sin autorización.", 401);

    const token = authHeader.replace("Bearer ", "");
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authenticate ─────────────────────────────────────────────────────────
    const { data: { user }, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !user) return err("Token inválido.", 401);

    // ── Authorize: ADMINISTRADOR only ────────────────────────────────────────
    const { data: adminProfile } = await supa
      .from("profiles")
      .select("id, is_active, role:roles(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (!adminProfile) return err("Perfil no encontrado.", 404);
    if (!adminProfile.is_active) return err("Tu cuenta está inactiva.", 403);
    if ((adminProfile.role as { name: string } | null)?.name !== "ADMINISTRADOR") {
      return err("Acceso denegado. Se requiere rol ADMINISTRADOR.", 403);
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json() as Record<string, unknown>;
    const {
      mode,
      document_ids,
      zip_name,
    } = body as {
      mode: "ids" | "filter";
      document_ids?: string[];
      zip_name?: string;
    };

    if (mode !== "ids") return err("Solo se admite mode='ids'.");
    if (!Array.isArray(document_ids) || document_ids.length === 0) {
      return err("document_ids es requerido y no puede estar vacío.");
    }
    if (document_ids.length > 200) {
      return err("No se pueden descargar más de 200 documentos a la vez.");
    }

    const safeZipName = zip_name
      ? sanitizeName(zip_name.replace(/\.zip$/i, ""))
      : "GESTOR_DOCUMENTAL";

    // ── Fetch documents with metadata ────────────────────────────────────────
    const { data: docs, error: docsErr } = await supa
      .from("documents")
      .select(`
        id, document_number, document_date, description,
        document_type:document_types(code),
        branch:branches(code, name)
      `)
      .in("id", document_ids);

    if (docsErr) return err("Error al obtener documentos: " + docsErr.message, 500);

    // ── Fetch latest PDF per document ────────────────────────────────────────
    const { data: pdfs, error: pdfsErr } = await supa
      .from("document_pdfs")
      .select("document_id, file_path, file_name, file_size")
      .in("document_id", document_ids)
      .order("created_at", { ascending: false });

    if (pdfsErr) return err("Error al obtener PDFs: " + pdfsErr.message, 500);

    // One PDF per document (latest first due to order)
    const latestPdf: Record<string, { file_path: string; file_name: string; file_size: number | null }> = {};
    for (const pdf of (pdfs ?? [])) {
      if (!latestPdf[pdf.document_id]) {
        latestPdf[pdf.document_id] = {
          file_path: pdf.file_path,
          file_name: pdf.file_name,
          file_size: pdf.file_size,
        };
      }
    }

    // ── Build path list for signed URLs ─────────────────────────────────────
    const pathsNeeded = Object.values(latestPdf).map((p) => p.file_path);
    const signedUrlMap: Record<string, string> = {};

    if (pathsNeeded.length > 0) {
      const { data: signedUrls, error: signedErr } = await supa.storage
        .from("document-pdfs")
        .createSignedUrls(pathsNeeded, 300);

      if (signedErr) return err("Error al generar URLs firmadas: " + signedErr.message, 500);

      for (const entry of (signedUrls ?? [])) {
        if (entry.signedUrl) {
          signedUrlMap[entry.path] = entry.signedUrl;
        }
      }
    }

    // ── Download PDFs and build ZIP ──────────────────────────────────────────
    const docMap = new Map<string, typeof docs[0]>();
    for (const d of (docs ?? [])) docMap.set(d.id, d);

    const zipFiles: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();
    const manifest: string[] = [`GESTOR DOCUMENTAL - Descarga masiva`, `Fecha: ${new Date().toISOString()}`, `Total documentos solicitados: ${document_ids.length}`, ``];

    let downloadedCount = 0;
    let skippedCount = 0;

    for (const docId of document_ids) {
      const doc = docMap.get(docId);
      if (!doc) {
        manifest.push(`[OMITIDO] ID ${docId} - No encontrado en base de datos`);
        skippedCount++;
        continue;
      }

      const typeCode = (doc.document_type as { code: string } | null)?.code ?? "DESCONOCIDO";
      const branchCode = (doc.branch as { code: string; name: string } | null)?.code ?? "SIN_SUCURSAL";
      const branchName = (doc.branch as { code: string; name: string } | null)?.name ?? "Sin Sucursal";

      const pdf = latestPdf[docId];
      if (!pdf) {
        manifest.push(`[SIN PDF] ${branchCode}/${typeCode}/${doc.document_number} - Sin archivo PDF`);
        skippedCount++;
        continue;
      }

      const signedUrl = signedUrlMap[pdf.file_path];
      if (!signedUrl) {
        manifest.push(`[ERROR URL] ${branchCode}/${typeCode}/${doc.document_number} - URL no generada`);
        skippedCount++;
        continue;
      }

      // Build filename
      const dateStr = (doc.document_date ?? "").replace(/-/g, "");
      const descPart = doc.description ? "_" + sanitizeName(doc.description).substring(0, 30) : "";
      const numPart = sanitizeName(doc.document_number);
      let baseName = `${typeCode}_${branchCode}_${dateStr}_${numPart}${descPart}`;
      const folderPath = `${sanitizeName(branchName)}/${typeCode}`;
      let finalPath = `${folderPath}/${baseName}.pdf`;

      // Deduplicate
      let suffix = 2;
      while (usedNames.has(finalPath)) {
        finalPath = `${folderPath}/${baseName}_${suffix}.pdf`;
        suffix++;
      }
      usedNames.add(finalPath);

      // Download PDF content
      try {
        const res = await fetch(signedUrl);
        if (!res.ok) {
          manifest.push(`[ERROR DESCARGA] ${finalPath} - HTTP ${res.status}`);
          skippedCount++;
          continue;
        }
        const buf = await res.arrayBuffer();
        zipFiles[finalPath] = new Uint8Array(buf);
        manifest.push(`[OK] ${finalPath} (${Math.round(buf.byteLength / 1024)} KB)`);
        downloadedCount++;
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        manifest.push(`[ERROR] ${finalPath} - ${msg}`);
        skippedCount++;
      }
    }

    manifest.push(``);
    manifest.push(`Resumen: ${downloadedCount} descargados, ${skippedCount} omitidos`);
    zipFiles["_INFORME.txt"] = new TextEncoder().encode(manifest.join("\n"));

    // ── Generate ZIP ─────────────────────────────────────────────────────────
    const zipData = zipSync(zipFiles);

    // ── Audit log (fire-and-forget) ──────────────────────────────────────────
    supa.from("audit_log").insert({
      user_id: user.id,
      action: "BULK_DOWNLOAD_PDF",
      entity_type: "document",
      entity_id: null,
      details: {
        requested: document_ids.length,
        downloaded: downloadedCount,
        skipped: skippedCount,
        zip_name: safeZipName,
      },
    }).then(() => {});

    return new Response(zipData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeZipName}.zip"`,
        "X-Downloaded-Count": String(downloadedCount),
        "X-Skipped-Count": String(skippedCount),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado.";
    return err(msg, 500);
  }
});
