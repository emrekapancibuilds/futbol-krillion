import type { Metadata } from "next";

import PremiumGame from "@/components/PremiumGame";

export const metadata: Metadata = { title: "Futbol Krillion Unlimited" };

export default function Play() {
  return <PremiumGame mode="unlimited" />;
}
