# Mendeley Integration for Obsidian

A desktop-only Obsidian plugin that syncs your [Mendeley](https://www.mendeley.com/) library into reading notes in your vault, using the [official Mendeley API](https://dev.mendeley.com/) (OAuth2 + REST).

*(Una versión de este README en español está en [README.es.md](README.es.md).)*

**Current status: Phase 1 (MVP).**

- ✅ OAuth2 authentication with Mendeley (Authorization Code flow) with automatic token refresh.
- ✅ **"Sync Mendeley library"** command: creates/updates one note per reference.
- ✅ **"Mendeley: full resync (ignore incremental progress)"** command: forces a full resync, ignoring the incremental cursor. Useful the first time you change the note template, the target folder, or after updating the plugin to a version that changes how notes are organized (e.g. when the per-folder subfolders were introduced) — otherwise, documents that haven't changed in Mendeley since the last sync won't be reprocessed and will keep their old organization.
- ✅ Frontmatter with `citekey`, title, authors, year, journal, DOI, URL, abstract, tags, Mendeley folders, `mendeley_id`, and last-modified date.
- ✅ Citekey generation (uses Mendeley's `citation_key` if present; otherwise `authorYear+firstTitleWord`, with automatic disambiguation).
- ✅ Incremental sync (`modified_since`) and pagination.
- ✅ Notes are organized into subfolders inside the target folder, mirroring Mendeley's folder hierarchy (including nested subfolders). If a document belongs to several Mendeley folders at once, the note is placed under the alphabetically first one (the full folder list is still kept in `mendeley_folders`); if it's in no folder, it stays at the root.
- ✅ Generated content lives inside a delimited block (`<!-- mendeley:start -->...<!-- mendeley:end -->`); anything you write outside that block (e.g. under `## My notes`) is never touched or deleted.
- 🔜 Phase 2: "Insert citation" command (`[@citekey]`, Pandoc format), importing PDF annotations/highlights.
- 🔜 Phase 3: CSL JSON export, opening the attached PDF/DOI from the note, filtering by folder when syncing.

**Known Phase 1 limitation:** if you delete a document in Mendeley, the corresponding local note is **not deleted automatically** (by design: the plugin never deletes your content). You'll need to clean it up by hand if you want to.

---

## 1. Requirements

- Obsidian for desktop (Windows/macOS/Linux). The plugin is `isDesktopOnly: true`.
- A Mendeley account with access to [dev.mendeley.com](https://dev.mendeley.com/).
- Node.js 18+ only if you're going to build the plugin yourself (see the Development section).

## 2. Create a Mendeley application (Client ID / Secret)

1. Go to [dev.mendeley.com](https://dev.mendeley.com/) and sign in with your Mendeley/Elsevier account.
2. Go to **"My Apps"** (`dev.mendeley.com/myapps.html`) and register a new application.
3. Fill out the form:
   - **Name / Description**: whatever you like, e.g. "Obsidian Mendeley Integration".
   - **Redirect URL**: copy the exact value shown in the plugin's settings tab (defaults to `obsidian://mendeley-auth-callback`). **It must match character for character.**
4. Save the app. Mendeley will show you a **Client ID** and a **Client Secret** — copy them, you'll need them in step 4.

> ⚠️ **If the registration form rejects `obsidian://mendeley-auth-callback`** (some OAuth providers only accept `http(s)` as a redirect URI for desktop apps): in practice we already confirmed Mendeley accepts this custom scheme end-to-end (authorization → token exchange → success), so this shouldn't come up. If it ever does for a different setup, the plugin's auth module is designed so the redirect URI can be swapped for a local loopback server (`http://127.0.0.1:<port>/callback`, the IETF-recommended mechanism for native apps) without reworking the rest of the plugin.

## 3. Install the plugin

This plugin is listed in Obsidian's official Community Plugins directory: in Obsidian, go to **Settings → Community plugins** → turn off "Restricted mode" if it's on → **Browse** → search for **"Mendeley Integration"** → install it → enable it.

Every user still needs to complete step 2 above (create your own Mendeley application) and step 4 below (configure and connect) — that part is the same for everyone, since each person needs their own Mendeley Client ID/Secret (see the security note in section 6 for why this can't be shared or bundled into the plugin).

## 4. Configure and connect

1. Go to **Settings → Mendeley Integration**.
2. Paste the **Client ID** and **Client Secret** you got in step 2.
3. Check that the **Redirect URI** shown matches the one you registered with Mendeley (use the copy button if you need to register it again).
4. Adjust the **target folder** (defaults to `Mendeley`) and, if you like, the **note template**.
5. Click **"Connect to Mendeley"**: your browser will open to authorize the app. Once you accept, Mendeley redirects you to `obsidian://mendeley-auth-callback?...`, Obsidian activates itself, and the plugin captures the authorization code automatically.
6. Run the **"Sync Mendeley library"** command (Ctrl/Cmd+P → type "Mendeley").

## 5. What each note looks like

```yaml
---
citekey: garcia2022microbiota
title: "Gut microbiota and cognitive decline"
authors:
  - "García, Ana"
  - "Smith, Jordan"
year: 2022
journal: "Journal of Neuroscience"
doi: "10.1000/xyz"
url: "https://example.com/paper"
abstract: "..."
tags: ["microbiota", "alzheimer"]
mendeley_folders: ["Thesis", "Alzheimer"]
mendeley_id: "abc-123"
mendeley_modified: "2024-01-01T00:00:00.000Z"
---

<!-- mendeley:start -->
## Gut microbiota and cognitive decline

**Authors:** García, Ana, Smith, Jordan
...
<!-- mendeley:end -->

## My notes

(write whatever you want here — it's never overwritten)
```

On every later sync, only the content inside `<!-- mendeley:start -->...<!-- mendeley:end -->` and the frontmatter keys the plugin manages (`citekey`, `title`, `authors`, `year`, `journal`, `doi`, `url`, `abstract`, `tags`, `mendeley_folders`, `mendeley_id`, `mendeley_modified`) get updated. Any other frontmatter key you add by hand is preserved.

## 6. Security and privacy

- The **Client Secret** and the access/refresh tokens are stored in `data.json`, inside the plugin's folder in your vault (`.obsidian/plugins/mendeley-integration/data.json`). **They are not encrypted.** Obsidian doesn't give community plugins access to the OS keychain, so this limitation is shared with most integration plugins (Google Calendar, GitHub Sync, etc.).
- If you share or sync your vault (e.g. with Git or another service), make sure to exclude `.obsidian/plugins/mendeley-integration/data.json` or avoid sharing that folder.
- The **"Disconnect"** button in the settings deletes the locally stored tokens (it doesn't revoke access on Mendeley's side; for that, check the authorized apps in your Mendeley account).

## 7. Development

```bash
npm install
npm run dev     # watch-mode build (esbuild)
npm run build   # type-check with tsc + minified production build
npm test        # run the unit tests (vitest)
```

Code layout in [`src/`](src): `auth/` (OAuth2), `api/` (HTTP client + endpoints), `sync/` (sync orchestration + delimited blocks), `citekey/` (citekey generation), `templates/` (frontmatter mapping + template rendering), `settings/`, and `commands/`.

The tests cover citekey generation, mapping Mendeley documents to frontmatter, and the delimited-block logic — the logic most prone to silent mistakes, since it runs on every sync against your real notes.

## 8. API reference used

- General docs: https://dev.mendeley.com/
- OAuth2 (Authorization Code): https://dev.mendeley.com/reference/topics/authorization_auth_code.html
- Methods/endpoints: https://dev.mendeley.com/methods/
