import type { MendeleyClient } from "./MendeleyClient";
import type { MendeleyDocument, MendeleyFolder } from "./types";

const PAGE_SIZE = 200;

export interface ListDocumentsOptions {
  modifiedSince?: string;
}

/** Follows the Link header (rel="next") instead of building pagination URLs by hand. */
export async function* iteratePages<T>(
  client: MendeleyClient,
  path: string,
  params: Record<string, string | number | undefined>
): AsyncGenerator<T[]> {
  let response = await client.request<T[]>(path, params);
  yield response.data;
  while (response.nextMarkerUrl) {
    response = await client.requestByUrl<T[]>(response.nextMarkerUrl);
    yield response.data;
  }
}

export function listAllDocuments(
  client: MendeleyClient,
  options: ListDocumentsOptions = {}
): AsyncGenerator<MendeleyDocument[]> {
  return iteratePages<MendeleyDocument>(client, "/documents", {
    view: "all",
    limit: PAGE_SIZE,
    modified_since: options.modifiedSince,
  });
}

export function listAllFolders(
  client: MendeleyClient
): AsyncGenerator<MendeleyFolder[]> {
  return iteratePages<MendeleyFolder>(client, "/folders", {
    limit: PAGE_SIZE,
  });
}

export function listFolderDocumentIds(
  client: MendeleyClient,
  folderId: string
): AsyncGenerator<{ id: string }[]> {
  return iteratePages<{ id: string }>(
    client,
    `/folders/${folderId}/documents`,
    { limit: PAGE_SIZE }
  );
}
