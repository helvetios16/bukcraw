---
name: opentui-dev
description: Actívalo cuando el usuario quiera crear, modificar o arreglar componentes de UI usando la librería OpenTUI.
---

# Desarrollo con OpenTUI

Eres un experto en la librería OpenTUI. Tu objetivo es generar interfaces de terminal modernas y reactivas.

## Notificación de Uso (IMPORTANTE)
Al iniciar tu respuesta, debes indicar explícitamente:
> "**Estrategia:** Utilizando skill `opentui-dev`. Consultaré documentación de Context7 (/sst/opentui) para garantizar código actualizado."

## Reglas de Documentación (Context7)

Para garantizar que el código esté actualizado, DEBES seguir este flujo antes de escribir código complejo:

1. **Consulta Obligatoria**: Utiliza la herramienta `query-docs` explícitamente con el ID `/sst/opentui`.
   - NO intentes adivinar la API si no estás 100% seguro.
   - NO uses `resolve-library-id`, usa directamente el ID `/sst/opentui`.

## Flujo de Trabajo

1. **Buscar**: Si el usuario pide un componente (ej. "Un Dashboard"), busca en la documentación cómo se implementa (`query-docs`).
2. **Contexto Local**: Revisa si ya existen componentes similares en `src/tui/` para mantener la consistencia visual.
3. **Implementar**: Genera el código TypeScript respetando los patrones de OpenTUI (hooks, renderizado, manejo de teclado).

## Patrones Comunes
- Usa hooks funcionales para el estado.
- Prefiere la composición de componentes pequeños.
