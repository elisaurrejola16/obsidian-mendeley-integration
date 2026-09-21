import { describe, it, expect } from "vitest";
import {
  generateCitekey,
  baseCitekeyFromMetadata,
} from "../src/citekey/CitekeyGenerator";
import type { MendeleyDocument } from "../src/api/types";

function doc(partial: Partial<MendeleyDocument>): MendeleyDocument {
  return { id: "1", ...partial };
}

describe("generateCitekey", () => {
  it("uses Mendeley's citation_key when present", () => {
    expect(
      generateCitekey(doc({ citation_key: "smith2020test" }), new Set())
    ).toBe("smith2020test");
  });

  it("falls back to author+year+word when citation_key is missing", () => {
    const d = doc({
      title: "The Gut Microbiome",
      year: 2021,
      authors: [{ last_name: "García", first_name: "Ana" }],
    });
    expect(baseCitekeyFromMetadata(d)).toBe("garcia2021gut");
  });

  it("disambiguates collisions by appending letter suffixes", () => {
    const d = doc({ citation_key: "garcia2021gut" });
    const existing = new Set(["garcia2021gut"]);
    expect(generateCitekey(d, existing)).toBe("garcia2021guta");
  });

  it("skips stopwords when picking the first significant title word", () => {
    const d = doc({
      title: "A Study of the Microbiota",
      year: 2019,
      authors: [{ last_name: "Lee" }],
    });
    expect(baseCitekeyFromMetadata(d)).toBe("lee2019study");
  });

  it("falls back to unknown/nd when author or year are missing", () => {
    const d = doc({ title: "Untitled Findings" });
    expect(baseCitekeyFromMetadata(d)).toBe("unknownnduntitled");
  });

  it("strips accents and non-alphanumeric characters from the surname", () => {
    const d = doc({
      title: "Álgo",
      year: 2020,
      authors: [{ last_name: "Muñoz-Ríos" }],
    });
    expect(baseCitekeyFromMetadata(d)).toBe("munozrios2020algo");
  });
});
