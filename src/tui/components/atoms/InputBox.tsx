import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

interface InputBoxProps {
  readonly placeholder?: string;
  readonly value?: string;
  readonly focused?: boolean;
  readonly onInput?: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly width?: number | "auto" | `${number}%`;
}

export function InputBox({
  placeholder = "",
  focused = false,
  onInput,
  onSubmit,
  width = 40,
}: InputBoxProps): ReactNode {
  return (
    <box
      width={width}
      height={3}
      border={true}
      borderStyle="rounded"
      borderColor={focused ? COLORS.PRIMARY : COLORS.BORDER}
      paddingLeft={1}
      paddingRight={1}
    >
      <input
        placeholder={placeholder}
        focused={focused}
        onInput={onInput}
        onSubmit={(e: string | { value?: unknown }) => {
          if (typeof e === "string") {
            onSubmit?.(e);
          } else if (e && typeof e.value === "string") {
            onSubmit?.(e.value);
          }
        }}
        style={{
          placeholderColor: COLORS.TEXT_DIM,
        }}
      />
    </box>
  );
}
