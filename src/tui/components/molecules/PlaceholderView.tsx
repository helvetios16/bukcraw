import type { JSX } from "react";
import { COLORS } from "../../../config/tui-colors";
import { SectionHeader } from "../atoms/SectionHeader";

interface PlaceholderViewProps {
  readonly title: string;
  readonly description: string;
}

export function PlaceholderView({ title, description }: PlaceholderViewProps): JSX.Element {
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
