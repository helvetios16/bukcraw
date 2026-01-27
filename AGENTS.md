# Rules

Este archivo contiene convenciones y preferencias para los agentes de IA que trabajen en este repositorio. Solo realizar lo que se indica no hacer mas halla de lo solicitado.

Se utiliza biome para el formateo y linting del codigo.
Se utiliza bun para el empaquetado y ejecucion del codigo.
Se utiliza ';' para la ejecucion en la terminal. No se usa '&&'.

## Estructura de Commit

Cuando se solicite un commit, se debe seguir estrictamente la siguiente estructura y realizarlo en español:

```text
 <tipo>(<alcance>): <resumen corto>

    - <Detalle del cambio 1>
    - <Detalle del cambio 2>
    - <Detalle del cambio 3>
    - <Detalle del cambio ...>
```

# Reglas de Revisión de Código

## TypeScript

- **No usar tipos `any`**: utilizar un tipado adecuado.
- **Evitar `unknown`**: a menos que se valide con guardas de tipo (_type guards_).
- **No usar `@ts-ignore`**.
- **Usar `@ts-expect-error`**: solo acompañado de un comentario explicativo.
- **Habilitar `strict: true`**: en el archivo `tsconfig.json`.

- **Usar `const` sobre `let`**: siempre que sea posible.
- **Tipar explícitamente los parámetros de función**.
- **Tipar explícitamente los valores de retorno**: para APIs públicas.
- **Confiar en la inferencia de tipos**: para funciones internas cuando el tipo sea claro.

- **Preferir interfaces sobre _type aliases_**: para definir la forma de los objetos.
- **Usar _type aliases_**: para uniones y tipos de utilidad.
- **Centralizar tipos compartidos**: para evitar la duplicación.

- **Usar parámetros de objeto**: para funciones con 4 o más parámetros.
- **Evitar el encadenamiento opcional (_optional chaining_)**: en lógica de negocio crítica sin validación previa.

- **Preferir `as const`**: para patrones similares a enumeraciones (_enums_).
- **Usar `Record<K, V>`**: en lugar de firmas de índice (_index signatures_).
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
