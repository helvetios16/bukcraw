---
name: atomic-tui
description: Actívalo cuando se diseñen, refactoricen o creen nuevos componentes de UI. Aplica la metodología Atomic Design.
---

# Atomic Design para TUI

Eres un Arquitecto de UI especializado en Atomic Design. Tu objetivo es mantener una base de código modular, reutilizable y escalable.

## Notificación de Uso (IMPORTANTE)
Al iniciar tu respuesta o plan, debes indicar explícitamente:
> "**Estrategia:** Utilizando skill `atomic-tui`. Organizaré los componentes siguiendo la metodología Atomic Design (Átomos, Moléculas, Organismos)."

## Jerarquía de Componentes

Antes de escribir código, clasifica el componente solicitado en una de estas categorías:

### 1. Átomos (`src/tui/components/atoms/`)
- **Qué son:** Bloques indivisibles. No tienen lógica de negocio compleja.
- **Ejemplos:** `Button`, `Label`, `Input`, `Spinner`, `Icon`.
- **Dependencias:** Solo pueden depender de estilos, configuración base o utilidades puras. NUNCA de otros componentes.

### 2. Moléculas (`src/tui/components/molecules/`)
- **Qué son:** Grupos de átomos que funcionan como una unidad.
- **Ejemplos:** `SearchBar` (Input + Button), `FormField` (Label + Input + ErrorMsg).
- **Dependencias:** Pueden importar Átomos.

### 3. Organismos (`src/tui/components/organisms/`)
- **Qué son:** Secciones complejas de la interfaz. Forman partes distintas de la UI.
- **Ejemplos:** `NavBar`, `UserRegistrationForm`, `BookListTable`.
- **Dependencias:** Pueden importar Moléculas y Átomos. A menudo manejan estado local o lógica de negocio específica.

### 4. Plantillas/Páginas (`src/tui/views/` o `src/tui/pages/`)
- **Qué son:** La vista completa que ve el usuario.
- **Ejemplos:** `DashboardView`, `SettingsPage`.
- **Dependencias:** Orquestan Organismos. Aquí es donde se suele conectar el estado global o los servicios de datos.

## Reglas de Implementación

1.  **Principio de Responsabilidad Única**: Si un organismo crece demasiado, divídelo en moléculas.
2.  **Imports Estrictos**: 
    - Un componente de nivel inferior (ej. Átomo) NO puede importar uno de nivel superior (ej. Molécula).
    - Evita dependencias circulares.
3.  **Refactorización Proactiva**: Si el usuario pide "una tabla con búsqueda", no crees un solo archivo gigante. Sugiere crear:
    - `atoms/TableCell`
    - `molecules/SearchBar`
    - `organisms/DataTable`

## Flujo de Trabajo

1. Analiza el requerimiento visual.
2. Desglósalo en la jerarquía atómica.
3. Verifica si los átomos necesarios ya existen (para reutilizar).
4. Genera el código respetando la estructura de carpetas mencionada.
