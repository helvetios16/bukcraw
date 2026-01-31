import { useKeyboard } from "@opentui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { COLORS } from "../../../config/tui-colors";
import { MOCK_BOOKS } from "../../../mocks/books/data";
import type { Book } from "../../../types";
import { InputBox } from "../atoms/InputBox";
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

    if (key.name === "escape") {
      onBack();
      return;
    }

    if (key.name === "q" && selectedIndex !== -1) {
      onBack();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (selectedIndex === -1) {
      if (key.name === "down" || key.name === "right") {
        setSelectedIndex(0);
      }
      return;
    }

    if (key.name === "right") {
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (key.name === "left") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (key.name === "down") {
      setSelectedIndex((prev) => (prev + COLUMNS < results.length ? prev + COLUMNS : prev));
    } else if (key.name === "up") {
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
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      alignItems="center"
      justifyContent={hasSearched && results.length > 0 ? "flex-start" : "center"}
      padding={1}
    >
      <box flexDirection="column" alignItems="center" marginBottom={2}>
        <SectionHeader title="SEARCH BOOK" />
        <text fg={COLORS.TEXT_DIM}>
          {hasSearched ? `Found ${results.length} results for "${query}"` : "Enter title to search"}
        </text>
      </box>

      <InputBox
        placeholder="Type book title..."
        value={query}
        onInput={setQuery}
        onSubmit={handleSearch}
        focused={selectedIndex === -1}
        width={60}
      />

      {/* Results Grid */}
      {hasSearched && (
        <box
          flexDirection="row"
          flexWrap="wrap"
          marginTop={2}
          width={100} // Approximate width for 3 columns of width 30 + margins
          justifyContent="center"
        >
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
            <box width="100%" justifyContent="center" marginTop={2}>
              <text fg={COLORS.WARNING}>No books found matching your query.</text>
            </box>
          )}
        </box>
      )}

      {hasSearched && results.length > 0 && (
        <text fg={COLORS.TEXT_DIM} marginTop={1}>
          Use Arrows to navigate grid. Enter to view details. [ q ] to return.
        </text>
      )}
    </box>
  );
}
