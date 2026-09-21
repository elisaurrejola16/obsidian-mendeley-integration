import { describe, it, expect } from "vitest";
import {
  replaceManagedBlock,
  extractManagedBlock,
  buildManagedBlock,
} from "../src/sync/DelimitedBlocks";

describe("DelimitedBlocks", () => {
  it("appends the managed block when it doesn't exist yet", () => {
    const content = "## My notes\n\nSomething I wrote myself.";
    const result = replaceManagedBlock(content, "Generated content");
    expect(result).toContain("## My notes");
    expect(result).toContain("Something I wrote myself.");
    expect(result).toContain(buildManagedBlock("Generated content"));
  });

  it("replaces only the content between markers, preserving text outside them", () => {
    const content = [
      "<!-- mendeley:start -->",
      "Old summary",
      "<!-- mendeley:end -->",
      "",
      "## My notes",
      "",
      "User text that must never be deleted.",
    ].join("\n");

    const result = replaceManagedBlock(content, "New summary");

    expect(result).toContain("New summary");
    expect(result).not.toContain("Old summary");
    expect(result).toContain("User text that must never be deleted.");
  });

  it("extractManagedBlock returns null when there are no markers", () => {
    expect(extractManagedBlock("no markers here")).toBeNull();
  });

  it("extractManagedBlock returns the trimmed content between markers", () => {
    const content = "<!-- mendeley:start -->\n  hello  \n<!-- mendeley:end -->";
    expect(extractManagedBlock(content)).toBe("hello");
  });

  it("leaves everything outside the block untouched across repeated sync cycles", () => {
    let content = "";
    content = replaceManagedBlock(content, "v1");
    content += "\n## My notes\n\nPersonal note.";
    content = replaceManagedBlock(content, "v2");
    content = replaceManagedBlock(content, "v3");

    expect(content).toContain("v3");
    expect(content).not.toContain("v1");
    expect(content).not.toContain("v2");
    expect(content).toContain("Personal note.");
  });
});
