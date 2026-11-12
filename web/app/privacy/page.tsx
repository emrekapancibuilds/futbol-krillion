import type { Metadata } from "next";
import LegalPage, { Mail } from "@/components/LegalPage.tsx";

// Describes the free game (payments removed 2026-11-12). Keep it in step with what the code really does.
export const metadata: Metadata = {
  title: "Privacy · Futkrill",
  description: "What Futkrill keeps on your device and what reaches our server.",
};

export default function Privacy() {
  const mail = <Mail />;
  return (
    <LegalPage title="Privacy" effective="November 12, 2026">
      <p>
        Futkrill is a free football trivia game: the daily, Unlimited, practice and the daily archive. Your scores
        stay in your browser. Practice and archive games use an essential session cookie and are stored on our
        server so the rounds belong to your browser. The game runs no advertising or analytics trackers.
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
        you&apos;re playing and when your time runs out. Practice and archive rounds are also tied to an anonymous
        browser session: we store which game you started and its prompts, but not a history of the answers you type,
        and we don&apos;t sync your scores.
      </p>

      <h2>Cookies</h2>
      <p>
        We set an essential HttpOnly session cookie when you start a practice or archive game, so its rounds stay
        with your browser. Only a hash of its random credential is stored in the database. Clearing the cookie ends
        any practice or archive game in progress; nothing else depends on it. The daily and Unlimited need no
        cookie.
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

      <h2>Where server-side records live</h2>
      <p>
        Supabase stores the anonymous browser sessions and the practice and archive games described above.
      </p>

      <h2>Earlier purchases</h2>
      <p>
        Until November 12, 2026, Unlimited was a paid unlock. We still hold the records from those purchases: Stripe
        customer and payment identifiers, the payment email, purchase status and purchase dates. We never stored card
        numbers. Stripe keeps the payment details under its{' '}
        <a href="https://stripe.com/privacy">privacy policy</a>. Futkrill no longer takes payments. Email {mail} to ask
        about these records or have them deleted.
      </p>

      <h2>Your data, your call</h2>
      <p>
        Clear the site&apos;s browser data to erase local progress and its session cookie. Contact {mail} for
        questions or requests about server-side information.
      </p>

      <h2>Children</h2>
      <p>
        Futkrill does not knowingly collect personal information from children under 13. If you think a child has sent us personal information (in an email,
        say), contact us and we&apos;ll delete it.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the new version will appear here with a new effective date.</p>

      <h2>Contact</h2>
      <p>Questions about any of this: {mail}.</p>
    </LegalPage>
  );
}
