import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const CACHE_DIR = join(process.cwd(), "cache");

// Find the most recent JSON file in the cache that looks like a Book Data file
const findLatestBookJson = async () => {
  const glob = new Glob("**/*.json");
  const candidates: { path: string; mtime: number }[] = [];

  for await (const file of glob.scan({ cwd: CACHE_DIR })) {
    const fullPath = join(CACHE_DIR, file);

    // Ignorar archivos auxiliares conocidos
    if (
      file.endsWith("-parsed.json") ||
      file.endsWith("-editions.json") ||
      file.endsWith("-filter-meta.json") ||
      file.includes("report-")
    ) {
      continue;
    }

    // Opcional: Verificar si el path sugiere que es un libro (contiene /book/show/)
    // Esto depende de cómo CacheManager estructure las carpetas, pero el filtro anterior ayuda mucho.

    candidates.push({
      path: fullPath,
      mtime: statSync(fullPath).mtime.getTime(),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  // Ordenar por fecha de modificación (más reciente primero)
  candidates.sort((a, b) => b.mtime - a.mtime);

  // Buscar el primer archivo que tenga la estructura correcta
  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate.path, "utf-8");
      const json = JSON.parse(content);
      if (json?.props?.pageProps?.apolloState) {
        return candidate.path;
      }
    } catch (e) {
      // Ignorar archivos corruptos o que no son JSON válidos
    }
  }

  return null;
};

const cachePath = await findLatestBookJson();

if (!cachePath) {
  console.error("❌ No JSON files found in cache.");
  process.exit(1);
}

console.log(`📂 Reading: ${cachePath}`);

const rawData = readFileSync(cachePath, "utf-8");
const json = JSON.parse(rawData);
const state = json.props.pageProps.apolloState;

// Helper to resolve references directly from the state map
const resolve = (ref: string | undefined | null) => {
  if (!ref) {
    return null;
  }
  return state[ref] || null;
};

// Find the main book entry using Regex for flexibility (starts with Book: and has titles)
const bookKey = Object.keys(state).find(
  (key) => /^Book:/.test(key) && state[key].title && state[key].titleComplete,
);

const data = state[bookKey || ""];

if (!data) {
  console.error("❌ No valid Book entry found with title data.");
  process.exit(1);
}

// Resolve relationships directly using __ref
const authorRef = data.primaryContributorEdge?.node?.__ref;
const authorData = resolve(authorRef);

const workRef = data.work?.__ref;
const workData = resolve(workRef);

const book = {
  id: data.legacyId,
  legacyId: workData?.legacyId,
  averageRating: workData?.stats?.averageRating, // Verificando la ruta sugerida
  webUrl: data?.webUrl,
  title: data.title,
  titleComplete: data.titleComplete,
  author: authorData?.name,
  description: data.description?.replace(/<br\s*\/?>/gi, "\n"),
  pages: data.details?.numPages,
  language: data.details?.language?.name,
  format: data.details?.format,
};

console.log("Extracted Book Data:");
console.log(book);
