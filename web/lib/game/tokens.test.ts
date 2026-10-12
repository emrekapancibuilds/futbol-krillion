import { test } from "node:test";
import assert from "node:assert/strict";

import { sign, verify } from "./tokens.ts";

const SECRET = "test-secret";

test("a signed payload verifies and round-trips", () => {
  const token = sign({ day: 3, round: 2, deadline: 1_000 }, SECRET);
  assert.deepEqual(verify(token, SECRET), { day: 3, round: 2, deadline: 1_000 });
});

test("a tampered payload or signature is rejected", () => {
  const token = sign({ day: 3, round: 2, deadline: 1_000 }, SECRET);
  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ day: 3, round: 2, deadline: 9_999_999 })).toString("base64url");
  assert.equal(verify(`${forged}.${mac}`, SECRET), null);
  assert.equal(verify(`${body}.${mac.slice(0, -2)}xx`, SECRET), null);
  assert.equal(verify(token, "other-secret"), null);
  assert.equal(verify("garbage", SECRET), null);
});
