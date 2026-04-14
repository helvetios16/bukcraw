# bukcraw

Scraper de Goodreads que extrae libros desde blogs, busca ediciones en español y genera reportes cruzados para optimizar retos de lectura.

## Instalacion

```bash
bun install
```

## Pipeline

El comando principal. Scrapea multiples blogs, extrae libros y ediciones, y genera un reporte combinado mostrando que libros aparecen en varios blogs (ideal para cubrir multiples retos con un solo libro).

```bash
bun run pipeline -- <blogId1> <blogId2> [opciones]
```

### Opciones

| Flag | Default | Descripcion |
|---|---|---|
| `--blogs=<id1,id2,...>` | — | Blog IDs separados por coma (alternativa a args posicionales) |
| `--language=<code>` | `spa` | Codigo de idioma (`spa`, `eng`, `por`, `ita`, `fra`, `deu`) |
| `--format=<fmt>` | `ebook,Kindle Edition` | Formatos separados por coma (`hardcover`, `paperback`, `ebook`, `Kindle Edition`, `audiobook`) |
| `--sort=<order>` | `num_ratings` | Orden de ediciones (`num_ratings`, `avg_rating`, `publish_date`) |
| `--no-report` | — | Omite la generación del reporte (solo realiza el scraping) |
| `--output=<path>` | auto-generado | Nombre del archivo de salida |
| `--help`, `-h` | — | Muestra ayuda |

### Ejemplos

```bash
# Dos blogs con defaults (español, ebook + Kindle)
bun run pipeline -- 3046-8-new-books-recommended 2941-best-romance-2026

# Tres blogs, solo ebooks en ingles
bun run pipeline -- --blogs=blog-1,blog-2,blog-3 --language=eng --format=ebook

# Con nombre de salida personalizado
bun run pipeline -- blog-1 blog-2 --output=reto-mayo-2026.json
```

### Que hace

1. **Phase 1 — Scraping**: Para cada blog, extrae los libros mencionados, scrapea detalles y busca ediciones con los filtros dados.
2. **Phase 2 — Reporte**: Cruza los datos en la base de datos, deduplica libros por titulo+autor, y genera un JSON con las relaciones.
3. **Output**: Muestra un resumen con los libros que aparecen en multiples blogs ("best picks") y cuantas ediciones tiene cada uno.

### Formato de salida

```json
{
  "generatedAt": "2026-04-09T...",
  "count": 85,
  "blogs": [
    { "id": "blog-1", "title": "Best Romance 2026", "url": "..." }
  ],
  "books": [
    {
      "id": "12345-book-title",
      "title": "Book Title",
      "author": "Author Name",
      "blogs": [
        { "id": "blog-1", "title": "Best Romance 2026", "url": "..." },
        { "id": "blog-2", "title": "New Releases", "url": "..." }
      ],
      "editionsFound": [
        { "title": "Edicion Kindle", "language": "spa", "format": "Kindle Edition", "link": "..." }
      ]
    }
  ]
}
```

## Scripts individuales

Si necesitas ejecutar pasos por separado:

| Script | Descripcion |
|---|---|
| `bun run scripts/cli/workflow-blog-to-editions.ts --blogId=<id>` | Scrapea un solo blog con sus ediciones |
| `bun run scripts/cli/report-books-relations.ts` | Genera reporte desde la DB (seleccion interactiva de blogs) |
| `bun run scripts/cli/create-session.ts` | Crea sesion de browser manualmente |
| `bun run scripts/db/export.ts --format=csv` | Exporta libros a CSV/JSON |

## Reporte visual

Abre `report.html` en el navegador y arrastra un JSON de `.reports/` para ver los libros con portadas, ratings y filtros interactivos. Todos los reportes generados se guardan en `.reports/`.

## Tests

```bash
bun test
```

## Tech stack

- **Runtime**: [Bun](https://bun.com)
- **Scraping**: Puppeteer + HTTP client hibrido con retry y rate-limiting
- **Parsing**: linkedom (DOM rapido sin browser)
- **DB**: SQLite (bun:sqlite)
- **Cache**: Archivos gzip por dia con auto-purge
