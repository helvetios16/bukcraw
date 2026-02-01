import { useKeyboard } from "@opentui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { COLORS } from "../../../config/tui-colors";
import { MOCK_BOOKS } from "../../../mocks/books/data";
import type { Book } from "../../../types";
import { InputBox } from "../atoms/InputBox";
import { ScreenFooter } from "../atoms/ScreenFooter";
import { SectionHeader } from "../atoms/SectionHeader";
import { BookCard } from "../molecules/BookCard";
import { BookDetails } from "./BookDetails";

interface BookSearchProps {
  readonly onBack: () => void;
}

const COLUMNS = 3;

export function BookSearch({ onBack }: BookSearchProps): ReactNode {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

  const handleSearch = (value: string) => {
    setQuery(value);

    if (value.trim().length > 0) {
      setHasSearched(true);

      const filtered = MOCK_BOOKS.filter(
        (book) =>
          book.title.toLowerCase().includes(value.toLowerCase()) ||
          book.author?.toLowerCase().includes(value.toLowerCase()),
      );

      setResults(filtered);
      setSelectedIndex(-1);
    } else {
      setHasSearched(false);
      setResults([]);
    }
  };

  useKeyboard((key) => {
    if (selectedBook) {
      return;
    }

    // --- Global Vim Controls ---

    // Enter Insert Mode
    if (!isSearchMode && key.name === "i") {
      setIsSearchMode(true);
      return;
    }

    // Exit Insert Mode or Go Back
    if (key.name === "escape") {
      if (isSearchMode) {
        setIsSearchMode(false);
      } else {
        onBack();
      }
      return;
    }

    // If in Search Mode (Insert), ignore other nav keys here
    // InputBox handles the actual text input
    if (isSearchMode) {
      return;
    }

    // --- Navigation Mode (Normal) ---

    if (key.name === "q") {
      onBack();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (selectedIndex === -1) {
      if (key.name === "down" || key.name === "right" || key.name === "j" || key.name === "l") {
        setSelectedIndex(0);
      }
      return;
    }

    if (key.name === "right" || key.name === "l") {
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (key.name === "left" || key.name === "h") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev + COLUMNS < results.length ? prev + COLUMNS : prev));
    } else if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev - COLUMNS >= 0 ? prev - COLUMNS : -1));
    } else if (key.name === "return" || key.name === "enter") {
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        const book = results[selectedIndex];
        if (book) {
          setSelectedBook(book);
        }
      }
    }
  });

  if (selectedBook) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <BookDetails book={selectedBook} onClose={() => setSelectedBook(null)} />
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Top Area: Header and Status Info (pinned to bottom of this top space, just above input) */}
      <box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="flex-end"
        paddingBottom={1}
      >
        <box width={60} flexDirection="column" alignItems="center">
          <SectionHeader title="SEARCH BOOK" align="center" />
          <text fg={COLORS.TEXT_DIM}>
            {hasSearched
              ? `Found ${results.length} results for "${query}"`
              : "Enter title to search"}
          </text>
        </box>
      </box>

      {/* Center Area: InputBox (The vertical anchor) */}
      <box width="100%" alignItems="center">
        <InputBox
          placeholder="Type book title... (Press 'i' to type)"
          value={query}
          onInput={setQuery}
          onSubmit={handleSearch}
          focused={isSearchMode}
          width={60}
        />
      </box>

      {/* Bottom Area: Results Grid (starts below input) */}
      <box flexGrow={1} flexDirection="column" alignItems="center" paddingTop={2}>
        {hasSearched && (
          <box flexDirection="row" flexWrap="wrap" width={100} justifyContent="center">
            {results.length > 0 ? (
              results.map((book, index) => (
                <BookCard
                  key={book.id}
                  title={book.title}
                  author={book.author || "Unknown"}
                  year={book.updatedAt ? new Date(book.updatedAt).getFullYear().toString() : "N/A"}
                  isSelected={index === selectedIndex}
                />
              ))
            ) : (
              <box width="100%" justifyContent="center">
                <text fg={COLORS.WARNING}>No books found matching your query.</text>
              </box>
            )}
          </box>
        )}
      </box>

      {/* Footer Legend */}
      <ScreenFooter>
        [i] Insert Mode | [ESC] Normal Mode | [h/j/k/l] Navigate | [q] Quit
      </ScreenFooter>
    </box>
  );
}
