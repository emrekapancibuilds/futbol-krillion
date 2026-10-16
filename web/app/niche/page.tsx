import type { Metadata } from "next";

import NicheOMeter from "@/components/NicheOMeter.tsx";

export const metadata: Metadata = {
  title: "Niche-o-meter · Futkrill",
  description: "Type a footballer and find out how niche they are, from 1 to 100.",
};

export default function NichePage() {
  return <NicheOMeter />;
}
