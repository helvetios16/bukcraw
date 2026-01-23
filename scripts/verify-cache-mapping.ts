/**
 * @file verify-cache-mapping.ts
 * @description Verifies that cached files exist for a given list of URLs by reproducing the hashing logic.
 */

import { existsSync } from "node:fs";
import { hashUrl } from "../src/utils/util";

// El JSON proporcionado
const data = {
  timestamp: "2026-01-23T07:17:03.722Z",
  legacyId: 66322,
  filters: {
    sort: "num_ratings",
    format: "",
    language: "",
  },
  stats: {
    totalPages: 19,
    scrapedUrls: [
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=2",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=3",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=4",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=5",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=6",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=7",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=8",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=9",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=10",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=11",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=12",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=13",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=14",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=15",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=16",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=17",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=18",
      "https://www.goodreads.com/work/editions/66322?utf8=%E2%9C%93&sort=num_ratings&page=19",
    ],
  },
};

// Determinar la fecha para la carpeta de caché (basado en el timestamp del JSON o la fecha actual)
// Nota: CacheManager usa la fecha de ejecución. Asumimos la fecha del JSON para la ruta.
const datePart = data.timestamp.split("T")[0]; // "2026-01-23"

console.log(`🔎 Verificando caché para ${data.stats.scrapedUrls.length} URLs...`);
console.log(`📂 Carpeta esperada: cache/${datePart}/misc/`);

data.stats.scrapedUrls.forEach((url, index) => {
  const hash = hashUrl(url);
  const relativePath = `cache/${datePart}/misc/${hash}.html`;

  // Verificamos si existe (asumiendo que corremos el script desde la raíz)
  const exists = existsSync(relativePath);
  const statusIcon = exists ? "✅" : "❌";

  console.log(`${statusIcon} [${index + 1}] ${hash}.html -> ...${url.slice(-20)}`);

  if (!exists) {
    // Intento alternativo: Quizás se guardó en otra fecha si el script corrió otro día?
    // Pero por ahora solo reportamos.
    // console.warn(`   (Archivo no encontrado: ${relativePath})`);
  }
});
