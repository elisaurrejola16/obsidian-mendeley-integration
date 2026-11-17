import { Plugin, TFile } from "obsidian";

const BUTTON_LABEL = "Download PDF from Mendeley";

/** Renders the ```mendeley-pdf code block that sync places in notes whose reference has a PDF attached. */
export function registerPdfButton(
  plugin: Plugin,
  download: (note: TFile) => Promise<void>
): void {
  plugin.registerMarkdownCodeBlockProcessor("mendeley-pdf", (_source, el, ctx) => {
    const note = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(note instanceof TFile)) return;

    const button = el.createEl("button", { text: BUTTON_LABEL, cls: "mod-cta" });
    button.addEventListener("click", () => {
      button.disabled = true;
      button.setText("Downloading...");
      void download(note).finally(() => {
        button.disabled = false;
        button.setText(BUTTON_LABEL);
      });
    });
  });
}
