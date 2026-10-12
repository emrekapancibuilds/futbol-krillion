import type { Metadata } from "next";
import LegalPage, { Mail } from "@/components/LegalPage.tsx";

// Privacy policy, modelled on krillion.io/privacy but describing only what this site actually does (audited
// 2026-10-11, payments added 2026-10-12: localStorage only, no cookies, no analytics or ads, answers checked and never
// stored, no database; Unlimited bought through Stripe Checkout and restored by email via Stripe).
// Update it BEFORE shipping accounts, ads, analytics or real standings: each one changes what is collected.
export const metadata: Metadata = {
  title: "Privacy · Futbol Krillion",
  description: "What Futbol Krillion keeps on your device and what reaches our server.",
};

export default function Privacy() {
  const mail = <Mail />;
  return (
    <LegalPage title="Privacy" effective="October 12, 2026">
      <p>
        Futbol Krillion is a daily football trivia game at futbolkrillion.vercel.app. The short version: there are no
        accounts or sign-ups. The daily is free, and Unlimited is a one-time purchase handled by Stripe, so card
        details never reach us. The site sets no cookies and runs no analytics, tracking or ads. Your progress is
        saved in your own browser. The answers you type are checked by our server and then thrown away.
      </p>
      <p>The details follow.</p>

      <h2>What stays on your device</h2>
      <p>
        Your browser&apos;s local storage holds your daily results, any round you&apos;re in the middle of, your
        streak and your Unlimited progress (your sets, your score and which prompts you&apos;ve already seen). If
        you&apos;ve bought Unlimited, it also holds an unlock code that proves it. Clearing this site&apos;s data in
        your browser erases all of it, streak and unlock included (you can restore the unlock, see below). Nothing
        syncs between devices, and we have no copy.
      </p>

      <h2>What reaches our server</h2>
      <p>Playing needs a few requests to our server:</p>
      <ul>
        <li>
          Starting a round fetches its prompt. In Unlimited, your browser also sends your unlock code, the round
          type you picked and the list of prompts you&apos;ve already seen, so you don&apos;t get repeats.
        </li>
        <li>
          Every answer you type is sent to the server to be checked. That&apos;s how scoring works. The server
          checks the answer, sends back the result and does not store it.
        </li>
        <li>When a round is over, the server sends back that round&apos;s top answers.</li>
      </ul>
      <p>
        Rounds are tracked with a signed ticket that your browser holds and sends back. It says which round
        you&apos;re playing and when your time runs out, and nothing about who you are. The server has no database
        of players, scores, answers or purchases.
      </p>

      <h2>Buying Unlimited</h2>
      <p>
        Unlimited is paid for on a checkout page hosted by Stripe. Your card details go to Stripe and never reach our
        server. Stripe keeps your email address and the payment, which is how receipts are sent and how a purchase
        can be restored; Stripe&apos;s side is covered by the{" "}
        <a href="https://stripe.com/privacy">Stripe privacy policy</a>. When you come back from checkout, our server
        asks Stripe whether that checkout was paid and, if it was, gives your browser its unlock code. We keep no
        copy of the purchase ourselves.
      </p>

      <h2>Restoring a purchase</h2>
      <p>
        To unlock Unlimited on another device, you type the email you paid with. It&apos;s sent to our server, which
        asks Stripe whether that email bought Unlimited. The email is used for that lookup only and isn&apos;t
        stored. Restoring only needs the email, so anyone who knows the email you paid with could unlock Unlimited
        on their own device with it.
      </p>

      <h2>Cookies</h2>
      <p>
        Futbol Krillion sets no cookies of its own, and its pages don&apos;t load any Stripe code. Stripe&apos;s
        checkout page runs on Stripe&apos;s own site and sets its own cookies there, under Stripe&apos;s policy.
      </p>

      <h2>Analytics and ads</h2>
      <p>
        There are no analytics, tracking pixels or ad networks on the site. Fonts and images come from our own
        site, so loading a page doesn&apos;t contact Google or any other third party.
      </p>

      <h2>Sharing a result</h2>
      <p>
        Share Result opens your device&apos;s share sheet, or copies text to your clipboard. The text says which
        game it was and shows your points per round, your best tier and a link. It never includes your name or your answers.
        Where you paste it is up to you, and that place&apos;s own privacy rules apply.
      </p>

      <h2>Who handles data</h2>
      <p>
        Two services handle data for us: Vercel hosts the site, and Stripe takes payments. Nobody else gets
        anything. Pages are delivered through Vercel&apos;s global network, and the game server runs in
        the United States. Like any web host, Vercel sees your IP address and basic request details (such as the
        page and browser type) when you connect, and keeps its own server logs under the{" "}
        <a href="https://vercel.com/legal/privacy-policy">Vercel privacy policy</a>. We don&apos;t use IP addresses
        for anything.
      </p>

      <h2>Coming later</h2>
      <p>
        Accounts or ads may come later, and each would change what&apos;s collected (an email address, advertising
        cookies). This page will be updated before either goes live.
      </p>

      <h2>Your data, your call</h2>
      <p>
        Everything the game keeps is on your device, so you can erase it yourself by clearing this site&apos;s data
        in your browser. If you bought Unlimited, the purchase record is with Stripe: to see it, correct it or have
        it deleted, email {mail} from the address you paid with. Deleting it means the purchase can no longer be
        restored. If you email us (for a refund, say), we have your address and what you wrote, and use them only
        to reply and sort out what you asked about.
      </p>

      <h2>Children</h2>
      <p>
        Futbol Krillion doesn&apos;t ask anyone for personal information, apart from the email Stripe asks for at
        checkout, and doesn&apos;t knowingly collect any from children under 13. If you think a child has sent us personal information (in an email,
        say), contact us and we&apos;ll delete it.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the new version will appear here with a new effective date.</p>

      <h2>Contact</h2>
      <p>Questions about any of this: {mail}.</p>
    </LegalPage>
  );
}
