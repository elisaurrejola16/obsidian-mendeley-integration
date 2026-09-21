# Mendeley Integration para Obsidian

Plugin de Obsidian (solo escritorio) que sincroniza tu biblioteca de [Mendeley](https://www.mendeley.com/) con notas de lectura en tu vault, usando la [API oficial de Mendeley](https://dev.mendeley.com/) (OAuth2 + REST).

**Estado actual: Fase 1 (MVP).**

- ✅ Autenticación OAuth2 con Mendeley (Authorization Code flow) y renovación automática de tokens.
- ✅ Comando **"Sincronizar biblioteca de Mendeley"**: crea/actualiza una nota por referencia.
- ✅ Comando **"Mendeley: resincronizar toda la biblioteca (ignora el avance incremental)"**: fuerza un resync completo ignorando el cursor incremental. Útil la primera vez que cambias la plantilla, la carpeta destino, o después de actualizar el plugin a una versión que cambia cómo se organizan las notas (por ejemplo, al activar las subcarpetas por carpeta de Mendeley) — de lo contrario, los documentos que no se han modificado en Mendeley desde el último sync no se vuelven a procesar y se quedan con la organización vieja.
- ✅ Frontmatter con `citekey`, título, autores, año, revista, DOI, URL, resumen, tags, carpetas de Mendeley, `mendeley_id` y fecha de modificación.
- ✅ Generación de citekey (usa `citation_key` de Mendeley si existe; si no, `autorAño+primeraPalabraDelTítulo`, con desambiguación automática).
- ✅ Sincronización incremental (`modified_since`) y paginación.
- ✅ Las notas se organizan en subcarpetas dentro de la carpeta destino, reflejando la jerarquía de carpetas de Mendeley (incluye sub-subcarpetas). Si un documento está en varias carpetas de Mendeley a la vez, la nota se ubica en la primera alfabéticamente (la lista completa de carpetas igual queda en `mendeley_folders`); si no está en ninguna, queda en la raíz.
- ✅ El contenido generado vive dentro de un bloque delimitado (`<!-- mendeley:start -->...<!-- mendeley:end -->`); todo lo que escribas fuera de ese bloque (por ejemplo, bajo `## Mis notas`) nunca se toca ni se borra.
- 🔜 Fase 2: comando "Insertar cita" (`[@citekey]`, formato Pandoc), importación de anotaciones/highlights de PDFs.
- 🔜 Fase 3: export a CSL JSON, abrir PDF/DOI desde la nota, filtro por carpeta al sincronizar.

**Limitación conocida de la Fase 1:** si borras un documento en Mendeley, la nota local correspondiente **no se elimina automáticamente** (por diseño: el plugin nunca borra contenido tuyo). Tendrás que limpiarla a mano si quieres.

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

### Opción A: Complementos comunitarios (recomendado)

Este plugin ya está en el catálogo oficial de Complementos comunitarios de Obsidian.

1. En Obsidian: **Ajustes → Plugins de la comunidad** → desactiva el "modo restringido" si está activo → **Explorar** → busca **"Mendeley Integration"** → instálalo → actívalo.

> ¿Recién se aprobó? Obsidian puede tardar hasta 24 horas en propagar un plugin recién aprobado a la búsqueda dentro de la app. Si todavía no te aparece, usa la Opción B mientras tanto, o simplemente intenta de nuevo un rato después.

### Opción B: BRAT (sin esperar, sin copiar archivos a mano)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) ("Beta Reviewers Auto-update Tool") es un plugin comunitario oficial que instala y actualiza automáticamente cualquier plugin de Obsidian alojado en GitHub, incluido este, antes de que el catálogo dentro de la app se ponga al día, o si quieres el último commit antes de que se publique como release.

1. En Obsidian: **Ajustes → Plugins de la comunidad** → desactiva el "modo restringido" si está activo → **Explorar** → busca **"BRAT"** → instálalo → actívalo.
2. Abre los ajustes de BRAT (o ejecuta el comando **"BRAT: Add a beta plugin for testing"**).
3. Pega la URL de este repositorio: `https://github.com/elisaurrejola16/obsidian-mendeley-integration`
4. BRAT descarga el `main.js`/`manifest.json` del último release y activa el plugin automáticamente.
5. Para actualizar más adelante, usa el comando **"Check for updates"** de BRAT — no hay que repetir nada de esto.

### Opción C: Instalación manual

1. Descarga `main.js` y `manifest.json` del [último release](https://github.com/elisaurrejola16/obsidian-mendeley-integration/releases/latest), o compílalos tú (ver sección "Desarrollo" más abajo).
2. En tu vault, crea la carpeta `.obsidian/plugins/mendeley-integration/`.
3. Copia esos 2 archivos dentro de esa carpeta.
4. En Obsidian: **Ajustes → Plugins de la comunidad** → desactiva el "modo restringido" si está activo → busca "Mendeley Integration" en la lista de plugins instalados → actívalo.

**Sin importar cuál opción uses**, todo usuario igual tiene que completar el paso 2 (crear su propia app de Mendeley) y el paso 4 (configurar y conectar) más abajo — eso no cambia según el método de instalación, porque cada persona necesita su propio Client ID/Secret de Mendeley (ver la nota de seguridad en la sección 6 sobre por qué esto no se puede compartir ni empaquetar dentro del plugin).

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
