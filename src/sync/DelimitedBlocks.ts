const START_MARKER = "<!-- mendeley:start -->";
const END_MARKER = "<!-- mendeley:end -->";

export const MENDELEY_BLOCK_MARKERS = { START_MARKER, END_MARKER };

export function buildManagedBlock(body: string): string {
  return `${START_MARKER}\n${body.trim()}\n${END_MARKER}`;
}

/**
 * Replaces only the content between the markers, leaving anything the user
 * wrote before/after untouched. If the markers don't exist yet, the block is
 * appended at the end without touching the previous content.
 */
export function replaceManagedBlock(
  existingContent: string,
  newBody: string
): string {
  const block = buildManagedBlock(newBody);
  const startIdx = existingContent.indexOf(START_MARKER);
  const endIdx = existingContent.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    if (existingContent.length === 0) return `${block}\n`;
    const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
    return `${existingContent}${separator}${block}\n`;
  }

  const before = existingContent.slice(0, startIdx);
  const after = existingContent.slice(endIdx + END_MARKER.length);
  return `${before}${block}${after}`;
}

export function extractManagedBlock(content: string): string | null {
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  return content.slice(startIdx + START_MARKER.length, endIdx).trim();
}
