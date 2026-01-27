import type { Renderer } from "@opentui/core";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Dashboard } from "./Dashboard";

const renderer: Renderer = await createCliRenderer({
  exitOnCtrlC: false,
});

createRoot(renderer).render(<Dashboard renderer={renderer} />);
