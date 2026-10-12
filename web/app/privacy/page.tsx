import type { Metadata } from "next";
import LegalPage, { Mail } from "@/components/LegalPage.tsx";

// Describes this purchase build. Review before publishing a production deployment.
export const metadata: Metadata = {
  title: "Privacy · Futbol Krillion",
  description: "What Futbol Krillion keeps on your device and what reaches our server.",
};

export default function Privacy() {
  const mail = <Mail />;
  return (
    <LegalPage title="Privacy" effective="October 12, 2026">
      <p>
        Futbol Krillion offers a free daily football trivia game and optional paid Unlimited access. Your scores
        stay in your browser. Purchase access uses an essential session cookie, Stripe payment records and
        Supabase. Restoring a purchase verifies your email with a passwordless Supabase link. The game runs no
        advertising or analytics trackers.
      </p>
      <p>The details follow.</p>

      <h2>What stays on your device</h2>
      <p>
        Your browser&apos;s local storage holds your daily results, any round you&apos;re in the middle of, your
        streak and your Unlimited progress (your sets, your score and which prompts you&apos;ve already seen).
        Clearing this site&apos;s data in your browser erases all of it, streak included. Nothing syncs between
        devices, and we have no copy.
      </p>

      <h2>What reaches our server</h2>
      <p>Playing needs a few requests to our server:</p>
      <ul>
        <li>
          Starting a round fetches its prompt. In Unlimited, your browser also sends the round type you picked and
          the list of prompts you&apos;ve already seen, so you don&apos;t get repeats.
        </li>
        <li>
          Every answer you type is sent to the server to be checked. That&apos;s how scoring works. The server
          checks the answer, sends back the result and does not store it.
        </li>
        <li>When a round is over, the server sends back that round&apos;s top answers.</li>
      </ul>
      <p>
        Rounds are tracked with a signed ticket that your browser holds and sends back. It says which round
        you&apos;re playing and when your time runs out. Paid rounds are also tied to an anonymous browser session.
        We store purchase, recovery and game-session records needed to enforce paid access, but do not store
        a history of the answers you type or sync your scores.
      </p>

      <h2>Cookies</h2>
      <p>
        We set an essential HttpOnly session cookie to recognize your browser for purchases and paid play. Only a
        hash of its random credential is stored in the database. Clearing the cookie removes this browser&apos;s
        access until you verify your payment email through Restore Purchase. Stripe may use its own cookies on
        its hosted payment and receipt pages.
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

      <h2>Hosting</h2>
      <p>
        Vercel hosts the site. Pages are delivered through Vercel&apos;s global network, and the game server runs in
        the United States. Like any web host, Vercel sees your IP address and basic request details (such as the
        page and browser type) when you connect, and keeps its own server logs under the{" "}
        <a href="https://vercel.com/legal/privacy-policy">Vercel privacy policy</a>. We don&apos;t use IP addresses
        for marketing. The app uses hashed rate-limit identifiers, including IP-derived values, to limit abuse.
      </p>

      <h2>Payments and email verification</h2>
      <p>
        Stripe processes card payments and stores the payment details. Our server keeps Stripe customer and
        purchase and payment identifiers, the payment email, purchase status and purchase dates. It does not store
        your full card number. Stripe handles this information under its{' '}
        <a href="https://stripe.com/privacy">privacy policy</a>.
      </p>
      <p>
        Supabase stores the records used for browser sessions and purchase access. If you use Restore Purchase,
        Supabase Auth creates an email identity and sends a verification link. No password is required. We compare
        the verified email with the current Stripe payment email before attaching paid access to your browser.
        Recovery requests expire after 15 minutes and are single-use. Verification does not restore local scores.
      </p>

      <h2>Your data, your call</h2>
      <p>
        Clear the site&apos;s browser data to erase local progress and its session cookie. This does not cancel a
        purchase or delete server-side payment and verification records.
        Contact {mail} for questions or requests about server-side information.
      </p>

      <h2>Children</h2>
      <p>
        Futbol Krillion does not knowingly collect personal information from children under 13. If you think a child has sent us personal information (in an email,
        say), contact us and we&apos;ll delete it.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the new version will appear here with a new effective date.</p>

      <h2>Contact</h2>
      <p>Questions about any of this: {mail}.</p>
    </LegalPage>
  );
}
