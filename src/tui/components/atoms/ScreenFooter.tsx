import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

interface ScreenFooterProps {
  readonly children: ReactNode;
}

export function ScreenFooter({ children }: ScreenFooterProps): ReactNode {
  return (
    <box
      position="absolute"
      bottom={0}
      width="100%"
      justifyContent="center"
      alignItems="center"
      paddingBottom={1}
    >
      {typeof children === "string" ? <text fg={COLORS.TEXT_DIM}>{children}</text> : children}
    </box>
  );
}
