import { describe, it, expect } from "vitest";
import {
  buildPdfBlockBody,
  hasPdfBlock,
  upsertPdfBlock,
} from "../src/pdf/PdfBlock";
import { looksLikePdf, pickPdfFile } from "../src/pdf/pdfFile";
import { replaceManagedBlock } from "../src/sync/DelimitedBlocks";
import type { MendeleyFile } from "../src/api/types";

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("looksLikePdf", () => {
  it("accepts data starting with the PDF header", () => {
    expect(looksLikePdf(bytes("%PDF-1.7\n..."))).toBe(true);
  });

  it("accepts a header preceded by a few junk bytes", () => {
    expect(looksLikePdf(bytes("\n\n%PDF-1.4"))).toBe(true);
  });

  it("rejects an HTML error page", () => {
    expect(looksLikePdf(bytes("<html><body>Access denied</body></html>"))).toBe(
      false
    );
  });

  it("rejects empty data", () => {
    expect(looksLikePdf(new ArrayBuffer(0))).toBe(false);
  });
});

describe("pickPdfFile", () => {
  const file = (over: Partial<MendeleyFile>): MendeleyFile => ({
    id: "f",
    document_id: "d",
    file_name: "x.bin",
    ...over,
  });

  it("prefers a file with a PDF mime type", () => {
    const files = [file({ id: "a", file_name: "notes.docx" }), file({ id: "b", mime_type: "application/pdf" })];
    expect(pickPdfFile(files)?.id).toBe("b");
  });

  it("falls back to the .pdf extension when the mime type is missing", () => {
    expect(pickPdfFile([file({ id: "c", file_name: "Paper.PDF" })])?.id).toBe("c");
  });

  it("returns null when there is no PDF", () => {
    expect(pickPdfFile([file({ file_name: "notes.docx" })])).toBeNull();
  });
});

describe("PDF block", () => {
  const note = replaceManagedBlock("", "Generated") + "\n## My notes\n\nMine.\n";

  it("starts out as a download button", () => {
    expect(buildPdfBlockBody({ kind: "button" })).toContain("```mendeley-pdf");
  });

  it("embeds the PDF with a fixed height", () => {
    expect(buildPdfBlockBody({ kind: "embed", linkText: "Paper.pdf" })).toContain(
      "![[Paper.pdf#height=600]]"
    );
  });

  it("is inserted right after the main managed block, before the user's notes", () => {
    const result = upsertPdfBlock(note, buildPdfBlockBody({ kind: "button" }));
    expect(result.indexOf("<!-- mendeley:end -->")).toBeLessThan(
      result.indexOf("<!-- mendeley-pdf:start -->")
    );
    expect(result.indexOf("<!-- mendeley-pdf:end -->")).toBeLessThan(
      result.indexOf("## My notes")
    );
    expect(result).toContain("Mine.");
  });

  it("replaces the button with the embed without touching anything else", () => {
    const withButton = upsertPdfBlock(note, buildPdfBlockBody({ kind: "button" }));
    const withEmbed = upsertPdfBlock(
      withButton,
      buildPdfBlockBody({ kind: "embed", linkText: "Paper.pdf" })
    );
    expect(withEmbed).toContain("![[Paper.pdf#height=600]]");
    expect(withEmbed).not.toContain("```mendeley-pdf");
    expect(withEmbed).toContain("Generated");
    expect(withEmbed).toContain("Mine.");
    expect(withEmbed.match(/mendeley-pdf:start/g)).toHaveLength(1);
  });

  it("does not interfere with the main managed block on later syncs", () => {
    const withEmbed = upsertPdfBlock(
      note,
      buildPdfBlockBody({ kind: "embed", linkText: "Paper.pdf" })
    );
    const resynced = replaceManagedBlock(withEmbed, "Regenerated");
    expect(resynced).toContain("Regenerated");
    expect(resynced).toContain("![[Paper.pdf#height=600]]");
    expect(hasPdfBlock(resynced)).toBe(true);
  });

  it("appends the block when the note has no managed block", () => {
    const result = upsertPdfBlock("Just my text", buildPdfBlockBody({ kind: "button" }));
    expect(result.startsWith("Just my text")).toBe(true);
    expect(hasPdfBlock(result)).toBe(true);
  });

  it("hasPdfBlock is false when the block is absent", () => {
    expect(hasPdfBlock(note)).toBe(false);
  });
});
