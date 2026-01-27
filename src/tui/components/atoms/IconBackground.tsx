import type { JSX } from "react";
import { useMemo } from "react";
import { BACKGROUND_ICONS } from "../../../config/icons";
import { COLORS } from "../../../config/tui-colors";

interface Particle {
  id: string;
  x: number;
  y: number;
  icon: string;
}

interface IconBackgroundProps {
  readonly intensity?: number;
  readonly children: React.ReactNode;
}

export function IconBackground({ intensity = 15, children }: IconBackgroundProps): JSX.Element {
  // We use process.stdout to get terminal dimensions for the random distribution.
  // Note: This calculates once on mount/render. If terminal resizes, it might not update
  // without a resize listener, but for now static is fine as requested.
  const maxWidth = process.stdout.columns || 80;
  const maxHeight = process.stdout.rows || 24;

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: intensity }).map((_, i) => ({
      id: `particle-${i}`,
      x: Math.floor(Math.random() * maxWidth),
      y: Math.floor(Math.random() * maxHeight),
      icon: BACKGROUND_ICONS[Math.floor(Math.random() * BACKGROUND_ICONS.length)],
    }));
  }, [intensity, maxWidth, maxHeight]);

  return (
    <box width="100%" height="100%">
      {/* Background Layer */}
      {particles.map((p) => (
        <box key={p.id} position="absolute" left={p.x} top={p.y}>
          <text fg={COLORS.BACKGROUND_ICON}>{p.icon}</text>
        </box>
      ))}

      {/* Content Layer - using zIndex if supported or just natural stacking 
          Since the background items are absolute, the children (if not absolute) 
          should render on top naturally in the flow, but we want them to take full space too.
      */}
      <box width="100%" height="100%" flexDirection="column">
        {children}
      </box>
    </box>
  );
}
