// scripts/test-fetch.ts
import { BOOK_URL, GOODREADS_URL, USER_AGENT } from "../src/config/constants";

async function testFetch(bookId: string) {
  const url = `${GOODREADS_URL}${BOOK_URL}${bookId}`;
  console.log(`🌐 Probando fetch a: ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,webp,application/json,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    const html = await response.text();
    const hasNextData = html.includes('id="__NEXT_DATA__"');
    const isCaptcha =
      html.toLowerCase().includes("captcha") ||
      html.includes("robot") ||
      html.includes("verify you are a human");

    if (isCaptcha) {
      console.log("❌ Detectado: Posible CAPTCHA o bloqueo de bot.");
      // Opcional: imprimir una parte del HTML para confirmar
      console.log("Contexto del error:", html.substring(0, 500).replace(/\s+/g, " "));
    } else if (response.ok) {
      if (hasNextData) {
        console.log("✅ Éxito: Se encontró #__NEXT_DATA__ en el HTML.");
      } else {
        console.log("⚠️ Advertencia: No se encontró #__NEXT_DATA__, pero la petición fue exitosa.");
      }
    } else {
      console.log(`❌ Error: La petición falló con estado ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Error fatal en la petición:", error);
  }
}

// Probar con un ID de libro conocido
const testId = "1";
testFetch(testId);
