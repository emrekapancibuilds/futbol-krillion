import Link from "next/link";

import { Logo } from "./Brand.tsx";

/** The white bar across the top of every page: the wordmark on the left, the page's links or controls on the right
 *  (by default, Unlimited and the Niche-o-meter). */
export default function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand"><Logo /></Link>
        <div className="right">
          {children ?? (
            <>
              <Link className="navlink" href="/unlimited">Unlimited</Link>
              <Link className="navlink hide-narrow" href="/niche">Niche-o-meter</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
