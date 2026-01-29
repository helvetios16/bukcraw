import { useKeyboard } from "@opentui/react";
import type { JSX } from "react";
import { useState } from "react";
import { COLORS } from "../../../config/tui-colors";
import { MenuItem } from "../atoms/MenuItem";
import { SectionHeader } from "../atoms/SectionHeader";

export interface MenuOption {
  readonly label: string;
  readonly value: string;
}

interface MainMenuProps {
  readonly options: MenuOption[];
  readonly onSelect: (value: string) => void;
  readonly onQuit: () => void;
}

interface KeyboardKey {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

export function MainMenu({ options, onSelect, onQuit }: MainMenuProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useKeyboard((key: KeyboardKey) => {
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (key.name === "return" || key.name === "enter") {
      onSelect(options[selectedIndex].value);
    } else if (key.name === "q") {
      onQuit();
    }
  });

  return (
    <box flexDirection="column" alignItems="center" width="100%">
      <SectionHeader title="BUKCRAW" />
      <box flexDirection="column" gap={1} marginTop={1} alignItems="center">
        {options.map((item, index) => (
          <MenuItem key={item.value} label={item.label} isSelected={index === selectedIndex} />
        ))}
      </box>
      <box marginTop={2} paddingX={1}>
        <text fg={COLORS.TEXT_DIM}>Use ↑/↓ to navigate, Enter to select, 'q' to quit.</text>
      </box>
    </box>
  );
}
