# Project Rules

## Entorno y Herramientas
- **Runtime:** Bun (usar en lugar de npm).
- **Linter/Formatter:** Biome.
- **UI:** OpenTUI (Context7 ID: `/sst/opentui`, ignorar `docs-opentui/`).
- **Shell:** Usar `;` para encadenar comandos en lugar de `&&`.

## Reglas de Revisión de Código

### TypeScript
- **No usar tipos `any`**: utilizar un tipado adecuado.
- **Evitar `unknown`**: a menos que se valide con guardas de tipo (*type guards*).
- **No usar `@ts-ignore`**.
- **Usar `@ts-expect-error`**: solo acompañado de un comentario explicativo.
- **Habilitar `strict: true`**: en el archivo `tsconfig.json`.
- **Usar `const` sobre `let`**: siempre que sea posible.
- **Tipar explícitamente los parámetros de función**.
- **Tipar explícitamente los valores de retorno**: para APIs públicas.
- **Confiar en la inferencia de tipos**: para funciones internas cuando el tipo sea claro.
- **Preferir interfaces sobre *type aliases***: para definir la forma de los objetos.
- **Usar *type aliases***: para uniones y tipos de utilidad.
- **Centralizar tipos compartidos**: para evitar la duplicación.
- **Usar parámetros de objeto**: para funciones con 4 o más parámetros.
- **Evitar el encadenamiento opcional (*optional chaining*)**: en lógica de negocio crítica sin validación previa.
- **Preferir `as const`**: para patrones similares a enumeraciones (*enums*).
- **Usar `Record<K, V>`**: en lugar de firmas de índice (*index signatures*).
- **Marcar datos inmutables con `readonly`**.

### TSX (React / OpenTUI)
- **Componentes Funcionales**: Usar `export function NombreComponente` en lugar de `const` o arrow functions para el componente principal.
- **Retorno Explícito**: Siempre tipar el retorno del componente como `JSX.Element`.
- **Nombres de Archivo**: PascalCase, coincidiendo con el nombre del componente (ej. `MainMenu.tsx`).
- **Interfaces para Props**: Definir siempre una interfaz nombrada `NombreComponenteProps`.
- **Inmutabilidad en Props**: Marcar todas las propiedades de la interfaz de props como `readonly`.
- **Tipado de Children**: Usar `React.ReactNode` para la propiedad `children`.
- **Valores por Defecto**: Asignar valores por defecto en la firma de la función mediante destructuración. No usar `defaultProps`.
- **Tipado de Estado**: Usar genéricos explícitos en `useState<T>` cuando el tipo inicial sea ambiguo o pueda ser nulo.
- **Custom Hooks**: Deben comenzar siempre con el prefijo `use` (ej. `useKeyboard`).
- **Imports de Tipo**: Usar `import type { ... }` para tipos e interfaces (ej. `import type { JSX } from "react"`).
- **Organización**: Confiar en Biome para el orden de los imports, pero mantener una separación lógica entre dependencias externas y archivos locales.
- **Componentes Primitivos (TUI)**: Usar `<box>` para layout/estructura y `<text>` para contenido textual.
- **Centralización de Estilos**: Importar colores e iconos desde `src/config/` en lugar de usar valores literales (*magic values*) en el TSX.
- **Bordes Redondeados**: Siempre que se utilice un borde, debe configurarse con `borderStyle="round"`.

## Directrices de Interacción
- **Minimalismo de Archivos:** No crear archivos Markdown (`.md`) adicionales a menos que se solicite explícitamente.
- **Concisión Extrema:** Proporcionar respuestas directas y evitar generar contenido innecesario o no solicitado.

## Verificación Post-Edición
Al usar habilidades de edición, ejecutar inmediatamente:
1. `bun run format:fix`
2. `bun run check:fix`
3. `bun run lint:fix`