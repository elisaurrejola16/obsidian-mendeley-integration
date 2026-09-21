import { describe, it, expect } from "vitest";
import {
  buildFolderPaths,
  pickPrimaryFolderPath,
} from "../src/sync/FolderHierarchy";
import type { MendeleyFolder } from "../src/api/types";

describe("buildFolderPaths", () => {
  it("builds nested paths following parent_id", () => {
    const folders: MendeleyFolder[] = [
      { id: "1", name: "Thesis" },
      { id: "2", name: "Alzheimer", parent_id: "1" },
      { id: "3", name: "Microbiota", parent_id: "2" },
    ];
    const paths = buildFolderPaths(folders);
    expect(paths.get("1")).toBe("Thesis");
    expect(paths.get("2")).toBe("Thesis/Alzheimer");
    expect(paths.get("3")).toBe("Thesis/Alzheimer/Microbiota");
  });

  it("sanitizes characters that are invalid in folder names", () => {
    const folders: MendeleyFolder[] = [{ id: "1", name: "Mice 3xTg/AD" }];
    expect(buildFolderPaths(folders).get("1")).toBe("Mice 3xTg-AD");
  });

  it("does not loop forever on an unexpected cycle in the data", () => {
    const folders: MendeleyFolder[] = [
      { id: "1", name: "A", parent_id: "2" },
      { id: "2", name: "B", parent_id: "1" },
    ];
    const paths = buildFolderPaths(folders);
    expect(paths.get("1")).toBeDefined();
    expect(paths.get("2")).toBeDefined();
  });
});

describe("pickPrimaryFolderPath", () => {
  const folderPathsById = new Map([
    ["1", "Thesis/Alzheimer"],
    ["2", "Thesis/Microbiota"],
    ["3", "Bioinformatics"],
  ]);

  it("returns null when the document is in no folders", () => {
    expect(pickPrimaryFolderPath([], folderPathsById)).toBeNull();
  });

  it("returns the only folder when the document is in a single one", () => {
    expect(pickPrimaryFolderPath(["1"], folderPathsById)).toBe(
      "Thesis/Alzheimer"
    );
  });

  it("picks the alphabetically first path when there are several folders", () => {
    expect(pickPrimaryFolderPath(["2", "3"], folderPathsById)).toBe(
      "Bioinformatics"
    );
  });

  it("ignores unknown folder ids", () => {
    expect(pickPrimaryFolderPath(["does-not-exist"], folderPathsById)).toBeNull();
  });
});
