import { DEFAULT_NOTE_TEMPLATE } from "../templates/defaultTemplate";

export interface MendeleySettings {
  clientId: string;
  clientSecret: string;
  targetFolder: string;
  noteTemplate: string;
  redirectUri: string;
}

export const DEFAULT_SETTINGS: MendeleySettings = {
  clientId: "",
  clientSecret: "",
  targetFolder: "Mendeley",
  noteTemplate: DEFAULT_NOTE_TEMPLATE,
  redirectUri: "obsidian://mendeley-auth-callback",
};
