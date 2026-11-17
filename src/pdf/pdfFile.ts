import type { MendeleyFile } from "../api/types";

/** Guards against saving an HTML error page (or similar) as a ".pdf". */
export function looksLikePdf(data: ArrayBuffer): boolean {
  const head = new Uint8Array(data, 0, Math.min(1024, data.byteLength));
  return String.fromCharCode(...head).includes("%PDF-");
}

export function pickPdfFile(files: MendeleyFile[]): MendeleyFile | null {
  return (
    files.find(
      (f) =>
        f.mime_type === "application/pdf" ||
        f.file_name.toLowerCase().endsWith(".pdf")
    ) ?? null
  );
}
