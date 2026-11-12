import type { Metadata } from "next";

import Game from "@/components/Game";

export const metadata: Metadata = { title: "Futkrill Unlimited" };

export default function Play() {
  return <Game mode="unlimited" />;
}
