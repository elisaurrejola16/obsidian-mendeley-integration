import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type MendeleyPlugin from "../main";

export class SettingsTab extends PluginSettingTab {
  plugin: MendeleyPlugin;

  constructor(app: App, plugin: MendeleyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Mendeley Integration" });

    const settings = this.plugin.data.settings;

    new Setting(containerEl)
      .setName("Client ID")
      .setDesc("Client ID of the application registered at dev.mendeley.com.")
      .addText((text) =>
        text.setValue(settings.clientId).onChange(async (value) => {
          settings.clientId = value.trim();
          await this.plugin.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Client Secret")
      .setDesc(
        "Client Secret for the same application. Stored unencrypted in the plugin's data.json (see README)."
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.clientSecret).onChange(async (value) => {
          settings.clientSecret = value.trim();
          await this.plugin.saveSettings(settings);
        });
      });

    new Setting(containerEl)
      .setName("Redirect URI")
      .setDesc(
        'Register exactly this URL as the "Redirect URL" in your Mendeley application.'
      )
      .addText((text) => {
        text.setValue(settings.redirectUri);
        text.inputEl.readOnly = true;
      })
      .addExtraButton((btn) =>
        btn
          .setIcon("copy")
          .setTooltip("Copy")
          .onClick(async () => {
            await navigator.clipboard.writeText(settings.redirectUri);
            new Notice("Redirect URI copied to clipboard.");
          })
      );

    new Setting(containerEl)
      .setName("Target folder")
      .setDesc("Vault folder where synced notes will be created.")
      .addText((text) =>
        text.setValue(settings.targetFolder).onChange(async (value) => {
          settings.targetFolder = value.trim() || "Mendeley";
          await this.plugin.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Note template")
      .setDesc(
        "Available variables: {{title}}, {{authors}}, {{year}}, {{journal}}, {{doi}}, {{abstract}}, {{citekey}}. This content is regenerated on every sync inside the managed block; write your own notes outside it (under '## My notes')."
      )
      .addTextArea((text) => {
        text.setValue(settings.noteTemplate).onChange(async (value) => {
          settings.noteTemplate = value;
          await this.plugin.saveSettings(settings);
        });
        text.inputEl.rows = 10;
        text.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Mendeley connection")
      .setDesc(
        this.plugin.authManager.isConnected() ? "Connected." : "Not connected."
      )
      .addButton((btn) => {
        if (this.plugin.authManager.isConnected()) {
          btn.setButtonText("Disconnect").onClick(async () => {
            await this.plugin.authManager.disconnect();
            new Notice("Disconnected from Mendeley.");
            this.display();
          });
        } else {
          btn
            .setButtonText("Connect to Mendeley")
            .setCta()
            .onClick(() => {
              try {
                this.plugin.authManager.beginAuthorization();
              } catch (err) {
                new Notice((err as Error).message, 6000);
              }
            });
        }
      });
  }
}
