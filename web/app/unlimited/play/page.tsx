import type { Metadata } from "next";

import Game from "@/components/Game.tsx";

export const metadata: Metadata = { title: "Futbol Krillion Unlimited" };

// Unlimited mode. Locked behind the one-time unlock: without a token it shows the pitch (components/Unlock.tsx).
export default function Play() {
  return <Game mode="unlimited" />;
}
