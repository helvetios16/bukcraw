import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

export interface BookCardProps {
  readonly title: string;
  readonly author: string;
  readonly year: string;
  readonly isSelected?: boolean;
}

export function BookCard({ title, author, year, isSelected = false }: BookCardProps): ReactNode {
  return (
    <box
      width={30}
      height={9}
      border={true}
      borderStyle="rounded"
      borderColor={isSelected ? COLORS.PRIMARY : COLORS.BORDER}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      margin={1}
    >
      <box height={2} width="100%" marginTop={1}>
        <text fg={isSelected ? COLORS.TEXT_BRIGHT : COLORS.TEXT}>{title}</text>
      </box>
      <box height={1} width="100%" marginTop={1}>
        <text fg={isSelected ? COLORS.PRIMARY : COLORS.TEXT_DIM}>By {author}</text>
      </box>

      <box marginTop={1} justifyContent="flex-end" width="100%">
        <text fg={COLORS.TEXT_DIM}>{year}</text>
      </box>
    </box>
  );
}
