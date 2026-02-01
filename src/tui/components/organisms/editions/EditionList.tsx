import { useKeyboard } from "@opentui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { COLORS } from "../../../../config/tui-colors";
import { MOCK_EDITIONS } from "../../../../mocks/editions/data";
import type { Book, Edition } from "../../../../types";
import { ScreenFooter } from "../../atoms/ScreenFooter";
import { SectionHeader } from "../../atoms/SectionHeader";
import { BookDetails } from "../BookDetails";

interface EditionListProps {
  readonly bookLegacyId?: number;
  readonly bookTitle: string;
  readonly bookAuthor?: string;
  readonly onBack: () => void;
}

export function EditionList({
  bookLegacyId,
  bookTitle,
  bookAuthor,
  onBack,
}: EditionListProps): ReactNode {
  const editions: Edition[] = bookLegacyId
    ? MOCK_EDITIONS.filter((e) => e.bookLegacyId === bookLegacyId)
    : [];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);

  useKeyboard((key) => {
    if (selectedEdition) {
      return;
    }

    if (key.name === "escape" || key.name === "backspace" || key.name === "q") {
      onBack();
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev < editions.length - 1 ? prev + 1 : prev));
    } else if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (key.name === "return" || key.name === "enter") {
      if (editions[selectedIndex]) {
        setSelectedEdition(editions[selectedIndex]);
      }
    }
  });

  if (selectedEdition) {
    const editionAsBook: Book = {
      id: selectedEdition.id || "0",
      title: selectedEdition.title,
      titleComplete: selectedEdition.title,
      author: bookAuthor || selectedEdition.publisher || "Unknown",
      description: selectedEdition.description,
      averageRating: selectedEdition.averageRating,
      pageCount: selectedEdition.pages,
      language: selectedEdition.language,
      format: selectedEdition.format,
      webUrl: selectedEdition.link,
      coverImage: selectedEdition.coverImage,
      legacyId: selectedEdition.bookLegacyId,
    };

    return (
      <BookDetails
        book={editionAsBook}
        onClose={() => setSelectedEdition(null)}
        allowEditionsView={false}
      />
    );
  }

  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center">
      <box
        width="90%"
        height="90%"
        border={true}
        borderStyle="rounded"
        borderColor={COLORS.SECONDARY}
        flexDirection="column"
        padding={2}
      >
        <SectionHeader title={`EDITIONS: ${bookTitle}`} />

        {editions.length > 0 ? (
          <box flexDirection="column" gap={1} flexGrow={1} overflow="hidden">
            {editions.map((edition, index) => {
              const isSelected = index === selectedIndex;
              const borderColor = isSelected ? COLORS.PRIMARY : COLORS.BORDER;
              const titleColor = isSelected ? COLORS.PRIMARY : COLORS.TEXT_BRIGHT;

              return (
                <box
                  key={edition.id || edition.title}
                  flexDirection="column"
                  border={true}
                  borderStyle="rounded"
                  borderColor={borderColor}
                  padding={1}
                >
                  <text fg={titleColor}>
                    {isSelected ? "> " : "  "}
                    {edition.title}
                  </text>
                  <box flexDirection="row" gap={2}>
                    <text fg={COLORS.TEXT_DIM}>{edition.format || "Unknown Format"}</text>
                    <text fg={COLORS.TEXT_DIM}>|</text>
                    <text fg={COLORS.TEXT_DIM}>{edition.publisher || "Unknown Publisher"}</text>
                    <text fg={COLORS.TEXT_DIM}>|</text>
                    <text fg={COLORS.TEXT_DIM}>{edition.publishedDate || "Unknown Date"}</text>
                  </box>
                  <text fg={COLORS.INFO}>★ {edition.averageRating?.toString() || "N/A"}</text>
                </box>
              );
            })}
          </box>
        ) : (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg={COLORS.WARNING}>No editions found for this book.</text>
          </box>
        )}
      </box>

      {/* Footer Legend - Outside the box */}
      <ScreenFooter>
        <box flexDirection="row" justifyContent="center">
          <text fg={COLORS.TEXT_DIM}>Use ↑/↓ to navigate, Enter to select details.</text>
          <text fg={COLORS.TEXT_DIM} marginLeft={2}>
            [ ESC/q ] Back
          </text>
        </box>
      </ScreenFooter>
    </box>
  );
}
