import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

export function App(): JSX.Element {
  return (
    <box
      borderStyle="round"
      flexDirection="column"
      padding={1}
      justifyContent="center"
      alignItems="center"
    >
      <text>Hola desde OpenTUI con React!</text>
    </box>
  );
}

async function start() {
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App />);
}

if (import.meta.main) {
  start();
}
