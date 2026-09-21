import { describe, it, expect } from "vitest";
import {
  mapDocumentToFrontmatter,
  mergeFrontmatter,
} from "../src/templates/frontmatterMapping";
import type { MendeleyDocument } from "../src/api/types";

describe("mapDocumentToFrontmatter", () => {
  it("maps the main Mendeley fields to the frontmatter", () => {
    const doc: MendeleyDocument = {
      id: "abc123",
      title: "Gut microbiota and Alzheimer",
      year: 2022,
      source: "Journal of Neuroscience",
      abstract: "An abstract.",
      authors: [{ first_name: "Ana", last_name: "García" }],
      identifiers: { doi: "10.1000/xyz" },
      websites: ["https://example.com/paper"],
      tags: ["microbiota", "alzheimer"],
      last_modified: "2024-01-01T00:00:00.000Z",
    };

    const fm = mapDocumentToFrontmatter(doc, "garcia2022gut", ["Neuroscience"]);

    expect(fm.citekey).toBe("garcia2022gut");
    expect(fm.authors).toEqual(["García, Ana"]);
    expect(fm.doi).toBe("10.1000/xyz");
    expect(fm.url).toBe("https://example.com/paper");
    expect(fm.mendeley_folders).toEqual(["Neuroscience"]);
    expect(fm.mendeley_id).toBe("abc123");
    expect(fm.mendeley_modified).toBe("2024-01-01T00:00:00.000Z");
  });

  it("falls back to safe defaults when fields are missing", () => {
    const doc: MendeleyDocument = { id: "x" };
    const fm = mapDocumentToFrontmatter(doc, "unknownndx", []);
    expect(fm.title).toBe("Untitled");
    expect(fm.authors).toEqual([]);
    expect(fm.year).toBeNull();
    expect(fm.doi).toBeNull();
    expect(fm.abstract).toBeNull();
  });

  it("uses whichever of first/last name is available when the other is missing", () => {
    const doc: MendeleyDocument = {
      id: "y",
      authors: [{ last_name: "Smith" }, { first_name: "Jordan" }],
    };
    const fm = mapDocumentToFrontmatter(doc, "smithndund", []);
    expect(fm.authors).toEqual(["Smith", "Jordan"]);
  });
});

describe("mergeFrontmatter", () => {
  it("overwrites Mendeley-owned keys but preserves user-added keys", () => {
    const existing = { citekey: "old", customField: "mine, do not touch" };
    const incoming = mapDocumentToFrontmatter(
      { id: "y", title: "New title" },
      "new2024key",
      []
    );
    const merged = mergeFrontmatter(existing, incoming);
    expect(merged.citekey).toBe("new2024key");
    expect(merged.title).toBe("New title");
    expect(merged.customField).toBe("mine, do not touch");
  });
});
