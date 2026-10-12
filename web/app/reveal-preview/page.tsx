import { notFound } from "next/navigation";

import RevealPreview from "@/components/RevealPreview.tsx";

// Development-only playground for the tier reveal: /reveal-preview?tier=7 (404 in production builds).
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RevealPreview />;
}
