import { useKeyboard } from "@opentui/react";
import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";
import { ScreenFooter } from "../atoms/ScreenFooter";
import { SectionHeader } from "../atoms/SectionHeader";

interface PlaceholderViewProps {
  readonly title: string;
  readonly description: string;
  readonly onBack: () => void;
}

export function PlaceholderView({ title, description, onBack }: PlaceholderViewProps): ReactNode {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      onBack();
    }
  });

  return (
    <box
      flexDirection="column"
      alignItems="center"
      width="100%"
      height="100%"
      justifyContent="center"
    >
      <box flexDirection="column" alignItems="center">
        <SectionHeader title={title} />
        <box flexDirection="column" alignItems="center" marginTop={1}>
          <text fg={COLORS.TEXT_BRIGHT}>{description}</text>
          <text fg={COLORS.TEXT_DIM} marginTop={1}>
            (Input implementation pending...)
          </text>
        </box>
      </box>

      <ScreenFooter>Press 'Esc' or 'q' to return to menu</ScreenFooter>
    </box>
  );
}
