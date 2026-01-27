import type { Renderer } from "@opentui/core";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import type { JSX } from "react";
import { COLORS } from "./src/config/tui-colors";

const renderer: Renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

interface NodeCardProps {
  readonly title: string;
  readonly status: "Active" | "Offline";
}

interface KeyboardKey {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

function NodeCard({ title, status }: NodeCardProps): JSX.Element {
  const isOnline: boolean = status === "Active";

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
        <text fg={isOnline ? COLORS.SUCCESS : COLORS.ERROR}>{isOnline ? "● ON" : "○ OFF"}</text>
      </box>
    </box>
  );
}

function App(): JSX.Element {
  useKeyboard((key: KeyboardKey) => {
    if (key.name === "q") {
      if (renderer) {
        renderer.destroy();
      }
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
        <text fg={COLORS.SECONDARY}>──▶</text>
        <NodeCard title="Base-Datos-01" status="Offline" />
      </box>

      <box flexDirection="column" alignItems="center" padding={1}>
        <text fg={COLORS.TEXT_DIM}>Press 'q' to exit</text>
      </box>
    </box>
  );
}

createRoot(renderer).render(<App />);
