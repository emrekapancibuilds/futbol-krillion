// The Unlimited pitch: Emre's note and the purchase details first, then the buy button. Shown inside the pop-up people
// get on arriving at /unlimited, and in the panel under the perks.

import Link from "next/link";

export default function UnlockPitch({ busy, onUnlock }: { busy: boolean; onUnlock: () => void }) {
  return <div className="unlock-pitch">
    <div className="creator-note">
      <p>Hey, I&apos;m Emre. I made Futkrill for people who know their football a little too well.</p>
      <p>Done with the daily? Keep playing, in whichever league or competition you know best. Your purchase also helps me keep building the game.</p>
      <p>Thanks for playing. — Emre</p>
    </div>
    <div className="unlock-details">
      <p>Unlimited practice + every previous daily.</p>
      <p className="price">$7.99 USD · pay once</p>
      <p className="muted billing-terms">One payment unlocks Unlimited. No recurring charges. Applicable taxes are shown at checkout. No account required. <Link href="/refunds">14-day refunds</Link>.</p>
    </div>
    <button className="btn unlock-cta" disabled={busy} onClick={onUnlock}>{busy ? 'PLEASE WAIT…' : 'UNLOCK UNLIMITED — $7.99'}</button>
  </div>;
}
