import type { JSX } from "react";
import { COLORS } from "../../../config/tui-colors";

export interface SearchResultItemProps {
  readonly title: string;
  readonly author: string;
  readonly year: string;
  readonly isSelected?: boolean;
}

export function SearchResultItem({
  title,
  author,
  year,
  isSelected = false,
}: SearchResultItemProps): JSX.Element {
  return (
    <box
      width="100%"
      height={3}
      border={true}
      borderStyle="rounded"
      borderColor={isSelected ? COLORS.PRIMARY : COLORS.SECONDARY}
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
    >
      <box flexDirection="column">
        <text fg={isSelected ? COLORS.TEXT_BRIGHT : COLORS.TEXT}>{title}</text>
        <text fg={COLORS.TEXT_DIM}>{author}</text>
      </box>
      <text fg={COLORS.TEXT_DIM}>{year}</text>
    </box>
  );
}
