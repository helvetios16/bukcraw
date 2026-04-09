// scripts/cli/create-session.ts

import { GOODREADS_URL } from "../../src/config/constants";
import { BrowserClient } from "../../src/core/browser-client";
import { DatabaseService } from "../../src/core/database";
import { GoodreadsService } from "../../src/services/goodreads-service";

async function createSession() {
  console.log("🚀 Iniciando proceso de creación de sesión...");
  const browserClient = new BrowserClient();
  // El servicio nos ayuda a manejar la lógica, aunque aquí seremos más directos
  const _service = new GoodreadsService(browserClient);

  try {
    const searchUrl = `${GOODREADS_URL}/search`;
    console.log(`🌐 Navegando al buscador: ${searchUrl}`);

    // Usamos el método de inicialización que ya tiene la lógica de captura
    // Pero lo haremos manual aquí para asegurar que vamos al buscador como pediste
    const page = await browserClient.launch();
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

    // Esperar un poco para que las cookies de tracking y sesión se asienten
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const cookiesArr = await page.cookies();
    const cookiesStr = cookiesArr.map((c) => `${c.name}=${c.value}`).join("; ");

    if (cookiesStr) {
      const db = new DatabaseService();
      db.saveSession(cookiesStr);

      console.log("✅ Sesión creada exitosamente y guardada en SQLite.");
      console.log(`📏 Tamaño de la cookie: ${cookiesStr.length} caracteres.`);
    } else {
      console.error("❌ No se pudieron obtener cookies.");
    }
  } catch (error) {
    console.error("❌ Error al crear la sesión:", error);
  } finally {
    await browserClient.close();
    console.log("✨ Proceso finalizado.");
    process.exit(0);
  }
}

createSession();
