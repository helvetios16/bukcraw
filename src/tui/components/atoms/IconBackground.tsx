import type { JSX } from "react";
import { useEffect, useState } from "react";
import { BACKGROUND_ICONS } from "../../../config/icons";
import { COLORS } from "../../../config/tui-colors";

interface Particle {
  id: string;
  x: number;
  y: number;
  icon: string;
  speed: number;
}

interface IconBackgroundProps {
  readonly intensity?: number;
  readonly speed?: number;
  readonly children: React.ReactNode;
}

export function IconBackground({
  intensity = 15,
  speed = 150,
  children,
}: IconBackgroundProps): JSX.Element {
  // Static dimensions to avoid constant resizing logic for now.
  const maxWidth = process.stdout.columns || 80;
  const maxHeight = process.stdout.rows || 24;

  const [particles, setParticles] = useState<Particle[]>(() => {
    return Array.from({ length: intensity }).map((_, i) => ({
      id: `particle-${i}`,
      x: Math.floor(Math.random() * maxWidth),
      y: Math.floor(Math.random() * maxHeight),
      icon: BACKGROUND_ICONS[Math.floor(Math.random() * BACKGROUND_ICONS.length)],
      speed: Math.random() > 0.5 ? 1 : 0.5, // Simple speed variation
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prevParticles) =>
        prevParticles.map((p) => {
          const newY = p.y + 1;

          if (newY >= maxHeight) {
            return {
              ...p,
              y: 0,
              x: Math.floor(Math.random() * maxWidth),
              icon: BACKGROUND_ICONS[Math.floor(Math.random() * BACKGROUND_ICONS.length)],
            };
          }
          return { ...p, y: newY };
        }),
      );
    }, speed);

    return () => clearInterval(interval);
  }, [maxHeight, maxWidth, speed]);

  return (
    <box width="100%" height="100%">
      {/* Background Layer */}
      {particles.map((p) => (
        <box key={p.id} position="absolute" left={p.x} top={p.y}>
          <text fg={COLORS.BACKGROUND_ICON}>{p.icon}</text>
        </box>
      ))}

      {/* Content Layer */}
      <box width="100%" height="100%" flexDirection="column">
        {children}
      </box>
    </box>
  );
}
