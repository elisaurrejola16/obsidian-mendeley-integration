import { describe, it, expect } from "vitest";
import { resolveCitekey, generateCitekey } from "../src/citekey/CitekeyGenerator";
import { buildNoteFileName, sanitizeNoteName } from "../src/templates/fileName";
import { hasUserContent, planDuplicateCleanup, NoteSnapshot } from "../src/sync/Duplicates";
import { mapDocumentToFrontmatter } from "../src/templates/frontmatterMapping";
import type { MendeleyDocument } from "../src/api/types";

const doc: MendeleyDocument = {
  id: "abc",
  title: "Stress and stability: Applying the Anna Karenina principle",
  year: 2017,
  authors: [{ first_name: "Jesse", last_name: "Zaneveld" }],
};

describe("resolveCitekey (regression: resync used to create 'xa' duplicates)", () => {
  it("keeps the citekey of a note that already exists", () => {
    const taken = new Set(["zaneveld2017stress"]);
    expect(resolveCitekey(doc, "zaneveld2017stress", taken)).toBe("zaneveld2017stress");
    // what the old code did for an already-synced reference:
    expect(generateCitekey(doc, taken)).toBe("zaneveld2017stressa");
  });

  it("still generates (and disambiguates) a citekey for a brand-new reference", () => {
    expect(resolveCitekey(doc, undefined, new Set())).toBe("zaneveld2017stress");
    expect(resolveCitekey(doc, undefined, new Set(["zaneveld2017stress"]))).toBe(
      "zaneveld2017stressa"
    );
  });
});

describe("buildNoteFileName", () => {
  const fm = mapDocumentToFrontmatter(doc, "zaneveld2017stress", []);

  it("defaults to the citekey", () => {
    expect(buildNoteFileName("{{citekey}}", fm)).toBe("zaneveld2017stress");
  });

  it("supports author, year and title, and makes the title safe as a file name", () => {
    expect(buildNoteFileName("{{author}} {{year}} - {{title}}", fm)).toBe(
      "Zaneveld 2017 - Stress and stability - Applying the Anna Karenina principle"
    );
  });

  it("falls back to the citekey when the template renders empty", () => {
    expect(buildNoteFileName("{{nope}}", fm)).toBe("zaneveld2017stress");
  });

  it("strips characters that break links or file systems", () => {
    expect(sanitizeNoteName('a/b|c?d*e"f#g^h[i]j')).toBe("a-b-cdefghij");
  });
});

describe("hasUserContent", () => {
  const generated = [
    "---", "citekey: x", "title: T", "mendeley_id: m1", "---", "",
    "<!-- mendeley:start -->", "## T", "<!-- mendeley:end -->", "",
    "<!-- mendeley-pdf:start -->", "## PDF", "<!-- mendeley-pdf:end -->", "",
    "## My notes", "", "",
  ].join("\n");

  it("is false for a note that only holds generated content", () => {
    expect(hasUserContent(generated)).toBe(false);
  });

  it("is true when the user wrote anything under the notes heading", () => {
    expect(hasUserContent(generated + "My own thoughts")).toBe(true);
  });

  it("is true when the heading itself was customised", () => {
    expect(hasUserContent(generated.replace("## My notes", "## My notes: Anna-Karenina"))).toBe(true);
  });

  it("is true when the user added a frontmatter key", () => {
    expect(hasUserContent(generated.replace("title: T", "title: T\nstatus: read"))).toBe(true);
  });
});

describe("planDuplicateCleanup", () => {
  const empty = "---\ncitekey: x\nmendeley_id: m1\n---\n\n<!-- mendeley:start -->\nx\n<!-- mendeley:end -->\n\n## My notes\n";
  const written = empty + "\nMy annotations\n";
  const note = (path: string, ctime: number, content: string, id = "m1"): NoteSnapshot => ({
    path, mendeleyId: id, ctime, content,
  });

  it("keeps the original (which holds the user's text) and trashes the empty copy", () => {
    const plan = planDuplicateCleanup([note("x.md", 1, written), note("xa.md", 2, empty)]);
    expect(plan.trash).toEqual(["xa.md"]);
    expect(plan.keptWithUserText).toEqual([]);
  });

  it("keeps the copy with the user's text even if it is the newer one", () => {
    const plan = planDuplicateCleanup([note("x.md", 1, empty), note("xa.md", 2, written)]);
    expect(plan.trash).toEqual(["x.md"]);
  });

  it("never trashes two copies that both hold user text", () => {
    const plan = planDuplicateCleanup([note("x.md", 1, written), note("xa.md", 2, written)]);
    expect(plan.trash).toEqual([]);
    expect(plan.keptWithUserText).toEqual(["xa.md"]);
  });

  it("keeps the oldest of several empty copies and ignores unique notes", () => {
    const plan = planDuplicateCleanup([
      note("x.md", 1, empty), note("xa.md", 2, empty), note("xb.md", 3, empty),
      note("y.md", 5, empty, "m2"),
    ]);
    expect(plan.trash.sort()).toEqual(["xa.md", "xb.md"]);
  });
});
