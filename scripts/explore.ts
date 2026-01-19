import { readFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "cache");
const FILENAME = "ee9feb0f54dd1c77f69270851f960690.json"; // Cambia esto para probar otro archivo

const cachePath = join(CACHE_DIR, FILENAME);
console.log(`📂 Reading: ${FILENAME}`);

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
  title: data.title,
  titleComplete: data.titleComplete,
  author: authorData?.name,
  description: data.description?.replace(/<br\s*\/?>/gi, "\n"),
  pages: data.details?.numPages,
  language: data.details?.language?.name,
  format: data.details?.format,
};

console.log(book);
