import { useKeyboard } from "@opentui/react";
import type { JSX } from "react";
import { COLORS } from "../../../config/tui-colors";
import type { Book } from "../../../types";

interface BookDetailsProps {
  readonly book: Book;
  readonly onClose: () => void;
}

export function BookDetails({ book, onClose }: BookDetailsProps): JSX.Element {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "backspace") {
      onClose();
    }
  });

  return (
    <box
      width="80%"
      height="80%"
      border={true}
      borderStyle="rounded"
      borderColor={COLORS.PRIMARY}
      flexDirection="column"
      padding={2}
      style={{
        // Center the modal
        position: "absolute",
        // OpenTUI centering might depend on parent, assuming parent is full width/height flex center
      }}
    >
      <box flexDirection="column" gap={1} flexGrow={1}>
        <text fg={COLORS.PRIMARY} bold={true} style={{ textDecoration: "underline" }}>
          {book.titleComplete || book.title}
        </text>

        <box flexDirection="row" gap={2}>
          <text fg={COLORS.TEXT_BRIGHT}>Author:</text>
          <text fg={COLORS.TEXT}>{book.author}</text>
        </box>

        <box flexDirection="row" gap={2}>
          <text fg={COLORS.TEXT_BRIGHT}>Rating:</text>
          <text fg={COLORS.WARNING}>{book.averageRating?.toString() ?? "N/A"}</text>
          <text fg={COLORS.TEXT_DIM}>| {book.pageCount} pages</text>
          <text fg={COLORS.TEXT_DIM}>| {book.language}</text>
        </box>

        <box flexDirection="column" marginTop={1}>
          <text fg={COLORS.TEXT_BRIGHT}>Description:</text>
          <text fg={COLORS.TEXT}>{book.description || "No description available."}</text>
        </box>
      </box>

      <box width="100%" height={1} marginTop={1} flexDirection="row" justifyContent="flex-end">
        <text fg={COLORS.TEXT_DIM}>[ ESC ] Back</text>
      </box>
    </box>
  );
}
