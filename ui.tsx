import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

function NodeCard({ title, status }: { title: string; status: "Active" | "Offline" }) {
  const isOnline = status === "Active";

  return (
    <box
      borderStyle="rounded"
      borderColor={isOnline ? "green" : "red"}
      padding={1}
      width={24}
      height={8}
      flexDirection="column"
      justifyContent="space-between"
    >
      <text>{title}</text>

      <text>{"CPU: 12%\nRAM: 4GB"}</text>

      <box flexDirection="row" justifyContent="flex-end">
        <text fg={isOnline ? "#00FF00" : "#FF0000"}>{isOnline ? "● ON" : "○ OFF"}</text>
      </box>
    </box>
  );
}

function App() {
  useKeyboard((key) => {
    if (key.name === "q") {
      // It is good practice to destroy the renderer before exiting
      // But since we are inside a component, we can just exit the process
      // and the OS cleans up. Alternatively, one could use a context or
      // passing the renderer prop if explicit cleanup is needed.
      // For simple CLI apps, process.exit(0) is often sufficient
      // if the renderer handles signal cleanup (which it does by default).
      renderer.destroy();
      process.exit(0);
    }
  });

  return (
    <box width="100%" height="100%" flexDirection="column">
      <box
        flexGrow={1}
        width="100%"
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        gap={2}
      >
        <NodeCard title="Servidor-Alpha" status="Active" />
        <text fg="gray">──▶</text>
        <NodeCard title="Base-Datos-01" status="Offline" />
      </box>

      <box flexDirection="column" alignItems="center" padding={1}>
        <text fg="gray">Press 'q' to exit</text>
      </box>
    </box>
  );
}

createRoot(renderer).render(<App />);

