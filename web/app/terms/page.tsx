import type { Metadata } from "next";
import Link from "next/link";

import LegalPage, { Mail } from "@/components/LegalPage.tsx";

// Factual billing descriptions updated for this build; review before a production launch.
export const metadata: Metadata = {
  title: "Terms · Futkrill",
  description: "The rules for playing Futkrill.",
};

export default function Terms() {
  const mail = <Mail />;
  return (
    <LegalPage title="Terms" effective="October 12, 2026">
      <p>
        These terms cover your use of Futkrill, the football trivia game at futkrill.vercel.app. By
        playing, you agree to them. The short version: play fair, have fun, and don&apos;t treat the answer lists as
        gospel. The daily game is free; optional paid access is described below.
      </p>

      <h2>The game</h2>
      <p>
        The daily game is free to play, with no account needed. A new daily goes live at 00:00 UTC. Unlimited
        practice and the daily archive require paid access. We may change any part of the game at any time, including prompts, answers, scoring and
        features, and we may pause it or stop running it.
      </p>

      <h2>Play fair</h2>
      <p>Play with your own football knowledge. Please don&apos;t:</p>
      <ul>
        <li>use bots, scripts or other automated tools to play, or to pull prompts or answer lists from our server;</li>
        <li>try to get around the timer, the answer checking or the limits on how much of each answer list is shown;</li>
        <li>overload, probe or disrupt the site or its server.</li>
      </ul>
      <p>We may block access that breaks these rules.</p>

      <h2>Scores and stats</h2>
      <p>
        Scores, tiers, streaks and the &ldquo;how you stack up&rdquo; chart are for fun, not an official record.
        They&apos;re kept in your browser, so if its data is cleared they&apos;re gone, and we can&apos;t restore them.
      </p>

      <h2>Football data</h2>
      <p>
        Prompts and answers are built from public football data, with its snapshot date shown at the bottom of the
        game. That data can be incomplete, out of date or wrong: a transfer after the snapshot won&apos;t count yet,
        and a player can be missing or sit in the wrong tier. How rare an answer is, and how many points it scores, is
        our own judgement, not a statement about any player. If you spot a mistake, tell us.
      </p>

      <h2>Names and trademarks</h2>
      <p>
        Player, club, league and competition names belong to their owners and appear only to refer to them. Futkrill
        is an independent fan-made game. It isn&apos;t affiliated with or endorsed by any player, club,
        league, FIFA or UEFA, or by Krillion (krillion.io).
      </p>

      <h2>Our content</h2>
      <p>
        The site&apos;s design, pixel art and code, and the way its prompts and answers are put together, belong to
        us. You&apos;re welcome to share your results and screenshots. Please don&apos;t copy the game, its art or its
        answer lists to use elsewhere.
      </p>

      <h2>Unlimited purchase</h2>
      <p>
        Unlimited costs $4.99 USD as a one-time payment, with no recurring charges. Applicable taxes are displayed
        at Checkout. Stripe handles payment. Your purchase unlocks Unlimited practice and the daily archive
        for as long as the game is available. A fully refunded payment no longer grants access; access may be
        suspended while a payment is disputed. Contact us with purchase questions or refund requests.
      </p>
      <p>
        Access is recognized in the purchasing browser. If you lose access or want it on another device, email{" "}
        {mail} from the address you paid with and we&apos;ll restore it. Restoring brings back paid access, not local
        scores or streaks.
      </p>

      <h2>No guarantees</h2>
      <p>
        To the extent the law allows, the game is provided as it is and as available, without warranties of any kind.
        We don&apos;t promise it will always be up, free of errors, or accurate.
      </p>

      <h2>Limit of liability</h2>
      <p>
        To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for lost progress,
        streaks or scores, that come from using the game. If we are ever found liable to you, our total liability is
        limited to what you paid us to use it. None of this limits rights you have under
        consumer law that can&apos;t be waived.
      </p>

      <h2>Privacy</h2>
      <p>
        How the game handles data is covered in the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The new version will appear here with a new effective date, and playing after
        that means you accept it.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms: {mail}.</p>
    </LegalPage>
  );
}
