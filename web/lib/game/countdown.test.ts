import assert from "node:assert/strict";
import test from "node:test";

import { countdown } from "./countdown.ts";

test("time to the next daily reads HH:MM:SS and never goes below zero", () => {
  assert.equal(countdown(0), "00:00:00");
  assert.equal(countdown(-5_000), "00:00:00");
  assert.equal(countdown(999), "00:00:00");
  assert.equal(countdown(61_000), "00:01:01");
  assert.equal(countdown(23 * 3_600_000 + 59 * 60_000 + 59_000), "23:59:59");
});
