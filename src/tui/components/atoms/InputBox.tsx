import type { JSX } from "react";
import { COLORS } from "../../../config/tui-colors";

interface InputBoxProps {
  readonly placeholder?: string;
  readonly value?: string;
  readonly focused?: boolean;
  readonly onInput?: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly width?: number | string;
}

export function InputBox({
  placeholder = "",
  focused = false,
  onInput,
  onSubmit,
  width = 40,
}: InputBoxProps): JSX.Element {
  return (
    <box
      width={width}
      height={3}
      border={true}
      borderStyle="rounded"
      borderColor={focused ? COLORS.PRIMARY : COLORS.BORDER}
      paddingX={1}
    >
      <input
        placeholder={placeholder}
        focused={focused}
        onInput={onInput}
        onSubmit={onSubmit}
        style={{
          fg: COLORS.TEXT,
          placeholderColor: COLORS.TEXT_DIM,
        }}
      />
    </box>
  );
}
