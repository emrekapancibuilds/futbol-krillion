import type { Metadata } from "next";
import Link from "next/link";

import LegalPage, { Mail } from "@/components/LegalPage.tsx";

// Terms of service: free daily, no accounts, no ads; Unlimited a one-time $4.99 Stripe purchase (2026-10-12).
// Update together with /privacy before shipping accounts, ads or a different price model. No governing-law clause yet: that depends
// on where the owner is based.
export const metadata: Metadata = {
  title: "Terms · Futbol Krillion",
  description: "The rules for playing Futbol Krillion.",
};

export default function Terms() {
  const mail = <Mail />;
  return (
    <LegalPage title="Terms" effective="October 12, 2026">
      <p>
        These terms cover your use of Futbol Krillion, the football trivia game at futbolkrillion.vercel.app. By
        playing, you agree to them. The short version: play fair, have fun, and don&apos;t treat the answer lists as
        gospel. The daily is free, Unlimited is a one-time purchase, and the game comes as it is.
      </p>

      <h2>The game</h2>
      <p>
        Futbol Krillion needs no account. The daily is free, and a new one goes live at 00:00 UTC. Unlimited, which
        lets you keep playing in sets of 7, is a one-time purchase. We may change any part of the game at any time,
        including prompts, answers, scoring and features, and we may pause it or stop running it.
      </p>

      <h2>Play fair</h2>
      <p>Play with your own football knowledge. Please don&apos;t:</p>
      <ul>
        <li>use bots, scripts or other automated tools to play, or to pull prompts or answer lists from our server;</li>
        <li>try to get around the timer, the answer checking or the limits on how much of each answer list is shown;</li>
        <li>overload, probe or disrupt the site or its server;</li>
        <li>unlock Unlimited with someone else&apos;s purchase, or share, sell or publish a way to unlock it.</li>
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
        Player, club, league and competition names belong to their owners and appear only to refer to them. Futbol
        Krillion is an independent fan-made game. It isn&apos;t affiliated with or endorsed by any player, club,
        league, FIFA or UEFA, or by Krillion (krillion.io).
      </p>

      <h2>Our content</h2>
      <p>
        The site&apos;s design, pixel art and code, and the way its prompts and answers are put together, belong to
        us. You&apos;re welcome to share your results and screenshots. Please don&apos;t copy the game, its art or its
        answer lists to use elsewhere.
      </p>

      <h2>Buying Unlimited</h2>
      <p>
        Unlimited costs $4.99 (US dollars), paid once through Stripe. There&apos;s no subscription; your bank may add
        its own currency conversion fee. It unlocks Unlimited on the device you buy on, and you can restore it on
        another device with the email you paid with. &ldquo;Forever&rdquo; means for as long as we run Futbol
        Krillion. We may change the price for new buyers, but that never changes what you&apos;ve already bought.
        Refunds follow our <Link href="/refunds">refund policy</Link>: in short, a full refund within 14 days, no
        questions asked.
      </p>

      <h2>Ads</h2>
      <p>There are no ads right now. If ads arrive, these terms and the privacy policy will be updated first.</p>

      <h2>No guarantees</h2>
      <p>
        To the extent the law allows, the game is provided as it is and as available, without warranties of any kind.
        We don&apos;t promise it will always be up, free of errors, or accurate.
      </p>

      <h2>Limit of liability</h2>
      <p>
        To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for lost progress,
        streaks or scores, that come from using the game. If we are ever found liable to you, our total liability is
        limited to what you paid us for Futbol Krillion, if anything. None of this limits rights you have under
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
