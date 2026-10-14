import { test } from "node:test";
import assert from "node:assert/strict";

import { dayLabel, dayLabelShort } from "./dayLabel.ts";

test("a day is named by its date, not its number (user, 2026-10-14)", () => {
  assert.equal(dayLabel("2026-10-14"), "October 14");
  assert.equal(dayLabel("2026-01-05"), "January 5");
  assert.equal(dayLabelShort("2026-10-14"), "OCT 14");
  assert.equal(dayLabelShort("2026-12-31"), "DEC 31");
});

test("the date is the UTC date, whatever time zone the player is in", () => {
  const was = process.env.TZ;
  for (const tz of ["Pacific/Auckland", "America/Los_Angeles", "UTC"]) {
    process.env.TZ = tz;
    assert.equal(dayLabel("2026-10-14"), "October 14", tz);
  }
  process.env.TZ = was;
});

test("a malformed date falls back to an empty label instead of 'Invalid Date'", () => {
  assert.equal(dayLabel(""), "");
  assert.equal(dayLabelShort("nope"), "");
});
