import { useKeyboard } from "@opentui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { COLORS } from "../../../config/tui-colors";
import type { Book } from "../../../types";
import { ScreenFooter } from "../atoms/ScreenFooter";
import { EditionList } from "./editions/EditionList";

interface BookDetailsProps {
  readonly book: Book;
  readonly onClose: () => void;
  readonly allowEditionsView?: boolean;
}

export function BookDetails({
  book,
  onClose,
  allowEditionsView = true,
}: BookDetailsProps): ReactNode {
  const [showEditions, setShowEditions] = useState(false);

  useKeyboard((key) => {
    if (showEditions) {
      return;
    }

    if (key.name === "escape" || key.name === "backspace" || key.name === "q") {
      onClose();
    } else if (allowEditionsView && key.name === "e") {
      setShowEditions(true);
    }
  });

  if (showEditions) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <EditionList
          bookLegacyId={book.legacyId}
          bookTitle={book.title}
          bookAuthor={book.author}
          onBack={() => setShowEditions(false)}
        />
      </box>
    );
  }

  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center">
      <box
        width="80%"
        height="80%"
        border={true}
        borderStyle="rounded"
        borderColor={COLORS.PRIMARY}
        flexDirection="column"
        padding={2}
      >
        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={COLORS.PRIMARY}>{book.titleComplete || book.title}</text>

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
      </box>

      <ScreenFooter>
        <box flexDirection="row" gap={2}>
          {allowEditionsView && <text fg={COLORS.TEXT_DIM}>[ e ] Editions</text>}
          <text fg={COLORS.TEXT_DIM}>[ ESC/q ] Back</text>
        </box>
      </ScreenFooter>
    </box>
  );
}
