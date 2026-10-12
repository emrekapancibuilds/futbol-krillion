import type { Metadata } from "next";

import LegalPage, { Mail } from "@/components/LegalPage.tsx";

// Refund policy for the one-time $4.99 Unlimited unlock. A placeholder the owner may change (2026-10-12): 14 days,
// no questions asked, and always for double charges or an unlock that never worked. Refunds are issued by hand in the
// Stripe dashboard; a refunded checkout can no longer restore or unlock (isUnlimitedPurchase in lib/payments/unlock.ts).
export const metadata: Metadata = {
  title: "Refunds · Futbol Krillion",
  description: "Changed your mind about Unlimited? How refunds work.",
};

export default function Refunds() {
  const mail = <Mail />;
  return (
    <LegalPage title="Refunds" effective="October 12, 2026">
      <p>
        Unlimited is a one-time $4.99 purchase. The short version: if it isn&apos;t for you, email us within 14 days
        and you&apos;ll get your money back, no questions asked.
      </p>

      <h2>Within 14 days</h2>
      <p>
        Email {mail} from the address you paid with, within 14 days of buying, and we&apos;ll refund the full $4.99.
        You don&apos;t need to give a reason.
      </p>

      <h2>After 14 days</h2>
      <p>Later refunds are up to us, but we&apos;ll always refund you if:</p>
      <ul>
        <li>you were charged more than once for Unlimited;</li>
        <li>you paid, but Unlimited never unlocked and we can&apos;t fix it;</li>
        <li>Unlimited stops working for you and we can&apos;t fix it.</li>
      </ul>

      <h2>How refunds work</h2>
      <p>
        Refunds go back to the card or payment method you paid with, through Stripe. Once we&apos;ve sent one, it
        usually shows up within 5 to 10 business days, depending on your bank. We refund what you paid us; any
        currency conversion fee your bank added is between you and your bank.
      </p>
      <p>
        A refund ends the purchase, so it can no longer be used to restore Unlimited on any device.
      </p>

      <h2>Before you dispute a charge</h2>
      <p>
        If a charge looks wrong, email us first. We can sort it out much faster than a dispute through your bank.
      </p>

      <h2>Your rights</h2>
      <p>This policy doesn&apos;t take away any refund rights you have under the law where you live.</p>

      <h2>Contact</h2>
      <p>Refund questions: {mail}.</p>
    </LegalPage>
  );
}
