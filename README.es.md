# Mendeley Integration para Obsidian

Plugin de Obsidian (solo escritorio) que sincroniza tu biblioteca de [Mendeley](https://www.mendeley.com/) con notas de lectura en tu vault, usando la [API oficial de Mendeley](https://dev.mendeley.com/) (OAuth2 + REST).

**Estado actual: Fase 1 (MVP) más PDFs bajo demanda.**

- ✅ Autenticación OAuth2 con Mendeley (Authorization Code flow) y renovación automática de tokens.
- ✅ Comando **"Sync Mendeley library"**: crea/actualiza una nota por referencia.
- ✅ Comando **"Mendeley: full resync (ignore incremental progress)"**: fuerza un resync completo ignorando el cursor incremental. Útil después de cambiar la plantilla de nota, o para refrescar notas cuyos documentos no han cambiado en Mendeley desde el último sync (el sync normal las salta). Actualiza las notas existentes en su sitio y nunca crea copias.
- ✅ Frontmatter con `citekey`, título, autores, año, revista, DOI, URL, resumen, tags, carpetas de Mendeley, `mendeley_id` y fecha de modificación.
- ✅ Generación de citekey (usa `citation_key` de Mendeley si existe; si no, `autorAño+primeraPalabraDelTítulo`, con desambiguación automática). Una referencia conserva su citekey una vez que tiene nota.
- ✅ Sincronización incremental (`modified_since`) y paginación.
- ✅ **Puedes renombrar y mover tus notas libremente.** Las notas se asocian a Mendeley por el `mendeley_id` de su frontmatter, nunca por nombre de archivo ni ubicación, y el sync no renombra ni mueve notas existentes.
- ✅ **Eliges cómo se llaman las notas nuevas** (ajuste "File name for new notes": `{{citekey}}`, `{{title}}`, `{{year}}`, `{{author}}`). Las notas nuevas se crean en subcarpetas que reflejan la jerarquía de carpetas de Mendeley (incluye anidadas). Si un documento está en varias carpetas, la nota va en la primera alfabéticamente (la lista completa queda en `mendeley_folders`); si no está en ninguna, queda en la raíz.
- ✅ El contenido generado vive dentro de un bloque delimitado (`<!-- mendeley:start -->...<!-- mendeley:end -->`); todo lo que escribas fuera de ese bloque (por ejemplo, bajo `## My notes`) nunca se toca ni se borra.
- ✅ **PDFs bajo demanda.** Las notas cuya referencia tiene PDF en Mendeley muestran un botón **"Download PDF from Mendeley"** (o usa el comando **"Download PDF of the current reference"**). El PDF se guarda en tu vault (ajuste "PDF folder", por defecto `Attachments/Mendeley`) y queda incrustado en la nota. Nada se descarga durante el sync, así tu vault no se llena de PDFs que no necesitas.
- ✅ **Destacar.** El comando **"Open PDF of the current reference (to highlight it)"** abre el PDF en su propia pestaña. Para destacados persistentes, usa un plugin de anotación de PDFs como [PDF++](https://community.obsidian.md/plugins/pdf-plus).
- ✅ Comando **"Remove duplicate reference notes"**: si una versión antigua del plugin dejó copias de tus notas (por ejemplo `citekey.md` y `citekeya.md`), mueve las copias sobrantes a la papelera tras pedir confirmación. Las copias que contienen texto tuyo nunca se tocan.
- 🔜 Fase 2: comando "Insertar cita" (`[@citekey]`, formato Pandoc), importación de los destacados que hiciste en Mendeley.
- 🔜 Fase 3: export a CSL JSON, abrir el DOI desde la nota, filtro por carpeta al sincronizar.

**Limitación conocida:** si borras un documento en Mendeley, la nota local correspondiente **no se elimina automáticamente** (por diseño: el plugin nunca borra contenido tuyo). Tendrás que limpiarla a mano si quieres.

---

## 1. Requisitos

- Obsidian de escritorio (Windows/macOS/Linux). El plugin es `isDesktopOnly: true`.
- Una cuenta de Mendeley con acceso a [dev.mendeley.com](https://dev.mendeley.com/).
- Node.js 18+ solo si vas a compilar el plugin tú mismo (ver sección de desarrollo).

## 2. Crear una aplicación en Mendeley (Client ID / Secret)

1. Entra a [dev.mendeley.com](https://dev.mendeley.com/) e inicia sesión con tu cuenta de Mendeley/Elsevier.
2. Ve a **"My Apps"** (`dev.mendeley.com/myapps.html`) y crea una nueva aplicación.
3. Completa el formulario:
   - **Name / Description**: lo que prefieras, por ejemplo "Obsidian Mendeley Integration".
   - **Redirect URL**: copia exactamente el valor que te muestra la pestaña de ajustes del plugin (por defecto `obsidian://mendeley-auth-callback`). **Debe coincidir carácter por carácter.**
4. Guarda la app. Mendeley te mostrará un **Client ID** y un **Client Secret**: cópialos, los necesitarás en el paso 4.

> ⚠️ **Si el formulario de registro rechaza `obsidian://mendeley-auth-callback`** (algunos proveedores OAuth solo aceptan `http(s)` como redirect URI para apps de escritorio): en la práctica ya confirmamos que Mendeley acepta este esquema custom de punta a punta (autorización → intercambio de token → éxito), así que no debería pasar. Si en algún otro caso ocurriera, la arquitectura del plugin permite cambiar a un flujo de servidor local (`http://127.0.0.1:<puerto>/callback`, el mecanismo recomendado por IETF para apps nativas) sin rehacer el resto del plugin.

## 3. Instalar el plugin

Este plugin ya está en el catálogo oficial de Complementos comunitarios de Obsidian: en Obsidian, ve a **Ajustes → Plugins de la comunidad** → desactiva el "modo restringido" si está activo → **Explorar** → busca **"Mendeley Integration"** → instálalo → actívalo.

Todo usuario igual tiene que completar el paso 2 de arriba (crear su propia app de Mendeley) y el paso 4 de abajo (configurar y conectar) — eso es igual para todos, porque cada persona necesita su propio Client ID/Secret de Mendeley (ver la nota de seguridad en la sección 6 sobre por qué esto no se puede compartir ni empaquetar dentro del plugin).

## 4. Configurar y conectar

1. Ve a **Ajustes → Mendeley Integration**.
2. Pega el **Client ID** y **Client Secret** obtenidos en el paso 2.
3. Verifica que el **Redirect URI** mostrado coincida con el que registraste en Mendeley (usa el botón de copiar si necesitas volver a registrarlo).
4. Ajusta la **carpeta destino** (por defecto `Mendeley`) y, si quieres, la **plantilla de nota**.
5. Haz clic en **"Conectar con Mendeley"**: se abrirá tu navegador para autorizar la app. Al aceptar, Mendeley te redirige a `obsidian://mendeley-auth-callback?...`, Obsidian se activa solo y el plugin captura el código de autorización automáticamente.
6. Ejecuta el comando **"Sincronizar biblioteca de Mendeley"** (Ctrl/Cmd+P → escribe "Mendeley").

## 5. Qué genera cada nota

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
mendeley_folders: ["Tesis", "Alzheimer"]
mendeley_id: "abc-123"
mendeley_modified: "2024-01-01T00:00:00.000Z"
---

<!-- mendeley:start -->
## Gut microbiota and cognitive decline

**Autores:** García, Ana, Smith, Jordan
...
<!-- mendeley:end -->

## Mis notas

(acá puedes escribir lo que quieras: nunca se sobrescribe)
```

En cada sincronización posterior, solo se actualiza el contenido dentro de `<!-- mendeley:start -->...<!-- mendeley:end -->` y las claves de frontmatter que administra el plugin (`citekey`, `title`, `authors`, `year`, `journal`, `doi`, `url`, `abstract`, `tags`, `mendeley_folders`, `mendeley_id`, `mendeley_modified`). Cualquier otra clave de frontmatter que agregues a mano se conserva.

## 6. Seguridad y privacidad

- El **Client Secret** y los tokens de acceso/refresco se guardan en `data.json`, dentro de la carpeta del plugin en tu vault (`.obsidian/plugins/mendeley-integration/data.json`). **No están cifrados.** Obsidian no da acceso al keychain del sistema operativo a plugins de comunidad, así que esta limitación es compartida con la mayoría de plugins de integración (Google Calendar, GitHub Sync, etc.).
- Si compartes o sincronizas tu vault (por ejemplo, con Git u otro servicio), asegúrate de excluir `.obsidian/plugins/mendeley-integration/data.json` o de no compartir esa carpeta.
- El botón **"Desconectar"** en los ajustes borra los tokens guardados localmente (no revoca el acceso del lado de Mendeley; para eso, revisa las apps autorizadas en tu cuenta de Mendeley).

- Además de `api.mendeley.com`, el plugin contacta el almacenamiento de archivos de Mendeley (una URL firmada de corta duración) solo cuando descargas un PDF. Tu token de Mendeley nunca se envía a ese almacenamiento.

## 7. Desarrollo

```bash
npm install
npm run dev     # compila en modo watch (esbuild)
npm run build   # type-check con tsc + build de producción minificado
npm test        # corre los tests unitarios (vitest)
```

Estructura del código en [`src/`](src): `auth/` (OAuth2), `api/` (cliente HTTP + endpoints), `sync/` (orquestación de sincronización + bloques delimitados), `citekey/` (generación de citekeys), `templates/` (mapeo a frontmatter + render de plantilla), `settings/` y `commands/`.

Los tests cubren la generación de citekeys, el mapeo de documentos de Mendeley a frontmatter y la lógica de bloques delimitados — la lógica más sensible a errores silenciosos, ya que corre en cada sincronización sobre tus notas reales.

## 8. Referencia de la API usada

- Documentación general: https://dev.mendeley.com/
- OAuth2 (Authorization Code): https://dev.mendeley.com/reference/topics/authorization_auth_code.html
- Métodos/endpoints: https://dev.mendeley.com/methods/
