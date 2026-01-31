import { useKeyboard } from "@opentui/react";
import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";
import { SectionHeader } from "../atoms/SectionHeader";

interface PlaceholderViewProps {
  readonly title: string;
  readonly description: string;
  readonly onBack: () => void;
}

export function PlaceholderView({ title, description, onBack }: PlaceholderViewProps): ReactNode {
  useKeyboard((key) => {
    if (key.name === "escape") {
      onBack();
    }
  });

  return (
    <box flexDirection="column" alignItems="center" width="100%">
      <SectionHeader title={title} />
      <box flexDirection="column" alignItems="center" marginTop={1}>
        <text fg={COLORS.TEXT_BRIGHT}>{description}</text>
        <text fg={COLORS.TEXT_DIM} marginTop={1}>
          (Input implementation pending...)
        </text>
      </box>
      <text fg={COLORS.TEXT_DIM} marginTop={2}>
        Press 'Esc' to return to menu
      </text>
    </box>
  );
}
