import { App, Modal, Setting } from "obsidian";

/** Small yes/no dialog; resolves true only if the user presses the confirm button. */
export function confirmAction(
  app: App,
  title: string,
  message: string,
  confirmLabel: string
): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const modal = new (class extends Modal {
      onOpen(): void {
        this.setTitle(title);
        this.contentEl.createEl("p", { text: message });
        new Setting(this.contentEl)
          .addButton((btn) =>
            btn.setButtonText("Cancel").onClick(() => this.close())
          )
          .addButton((btn) =>
            btn
              .setButtonText(confirmLabel)
              .setWarning()
              .onClick(() => {
                answered = true;
                resolve(true);
                this.close();
              })
          );
      }
      onClose(): void {
        this.contentEl.empty();
        if (!answered) resolve(false);
      }
    })(app);
    modal.open();
  });
}
