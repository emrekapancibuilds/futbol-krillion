import assert from "node:assert/strict";
import test from "node:test";

import { sign } from "../game/tokens.ts";
import { checkoutParams, emailVariants, findPurchase, isUnlimitedPurchase, isUnlocked, stripeKey, unlockToken } from "./unlock.ts";

const SECRET = "test-secret";
const PAID = { id: "cs_paid", status: "complete", payment_status: "paid", metadata: { product: "unlimited" } };

test("an unlock token from a purchase unlocks Unlimited", () => {
  assert.equal(isUnlocked(unlockToken("cs_paid", SECRET), SECRET), true);
});

test("missing, forged or other tokens don't unlock", () => {
  assert.equal(isUnlocked(undefined, SECRET), false);
  assert.equal(isUnlocked("", SECRET), false);
  assert.equal(isUnlocked(unlockToken("cs_paid", "another-secret"), SECRET), false);
  assert.equal(isUnlocked(sign({ prompt: "p0123456789", deadline: 1 }, SECRET), SECRET), false);   // a round token
  assert.equal(isUnlocked(sign({ day: 1, round: 0, done: true }, SECRET), SECRET), false);          // a proof token
  const [body] = unlockToken("cs_paid", SECRET).split(".");
  assert.equal(isUnlocked(`${body}.tampered`, SECRET), false);
});

test("only a complete, paid Unlimited checkout counts as a purchase", () => {
  assert.equal(isUnlimitedPurchase(PAID), true);
  assert.equal(isUnlimitedPurchase({ ...PAID, payment_status: "unpaid" }), false);
  assert.equal(isUnlimitedPurchase({ ...PAID, status: "open" }), false);
  assert.equal(isUnlimitedPurchase({ ...PAID, metadata: { product: "something-else" } }), false);
  assert.equal(isUnlimitedPurchase({ ...PAID, metadata: null }), false);
});

test("a refunded purchase no longer counts, so it can't be restored or unlocked again", () => {
  const charged = (refunded: boolean) => ({ ...PAID, payment_intent: { latest_charge: { refunded } } });
  assert.equal(isUnlimitedPurchase(charged(false)), true);
  assert.equal(isUnlimitedPurchase(charged(true)), false);
  assert.equal(isUnlimitedPurchase({ ...PAID, payment_intent: "pi_123" }), true);      // not expanded: can't tell, allow
});

test("emails are trimmed, also tried in lower case, and junk is refused", () => {
  assert.deepEqual(emailVariants("  Fan@Example.com "), ["Fan@Example.com", "fan@example.com"]);
  assert.deepEqual(emailVariants("fan@example.com"), ["fan@example.com"]);
  for (const bad of ["", "fan", "fan@", "@example.com", "a b@example.com", 42, null, `${"x".repeat(250)}@example.com`]) {
    assert.deepEqual(emailVariants(bad), [], String(bad));
  }
});

test("restore finds a paid Unlimited checkout under either spelling of the email", async () => {
  const byEmail: Record<string, (typeof PAID)[]> = {
    "fan@example.com": [{ ...PAID, id: "cs_open", status: "open", payment_status: "unpaid" }, PAID],
  };
  const asked: string[] = [];
  const list = async (email: string) => { asked.push(email); return byEmail[email] ?? []; };
  assert.equal((await findPurchase("Fan@Example.com", list))?.id, "cs_paid");
  assert.deepEqual(asked, ["Fan@Example.com", "fan@example.com"]);
  assert.equal(await findPurchase("nobody@example.com", list), null);
  assert.equal(await findPurchase("not an email", list), null);
});

test("production never takes a Stripe test key (test cards would unlock for free); other environments do", () => {
  assert.equal(stripeKey("sk_live_abc", "production"), "sk_live_abc");
  assert.equal(stripeKey("rk_live_abc", "production"), "rk_live_abc");
  assert.equal(stripeKey("sk_test_abc", "production"), null);
  assert.equal(stripeKey("rk_test_abc", "production"), null);
  assert.equal(stripeKey("sk_test_abc", "preview"), "sk_test_abc");
  assert.equal(stripeKey("sk_test_abc", undefined), "sk_test_abc");     // local
  assert.equal(stripeKey(undefined, "production"), null);
  assert.equal(stripeKey("", undefined), null);
});

test("checkout is a one-time $4.99 payment with standard Stripe payments, back to this site either way", () => {
  const p = checkoutParams("https://futbolkrillion.vercel.app");
  assert.equal(p.mode, "payment");
  assert.deepEqual(p.managed_payments, { enabled: false });   // the account defaults to Managed Payments, which needs tax codes
  assert.equal(p.line_items[0].price_data.unit_amount, 499);
  assert.equal(p.line_items[0].price_data.currency, "usd");
  assert.equal(p.metadata.product, "unlimited");
  assert.equal(p.success_url, "https://futbolkrillion.vercel.app/unlimited/unlocked?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(p.cancel_url, "https://futbolkrillion.vercel.app/");
});
