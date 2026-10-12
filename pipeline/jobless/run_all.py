"""Run the whole pipeline in order: python -m jobless.run_all --launch 2026-11-01 [--from STEP] [--skip STEP ...].

`--skip pageviews` is the normal way to run when Wikipedia is throttling: fame then rates attention from
sitelinks alone, and page views can be filled in later with `python -m jobless.pageviews`.
"""
import argparse
import time

from jobless import (build_prompts, calibrate, derive_tm, export, fame_entities, fame_players, ingest_tm, ingest_wd,
                     merge_players, pageviews, schedule)

STEPS = [("ingest_tm", ingest_tm.main), ("ingest_wd", ingest_wd.main), ("pageviews", pageviews.main),
         ("merge", merge_players.main), ("derive", derive_tm.main), ("fame_entities", fame_entities.main),
         ("fame_players", fame_players.main), ("calibrate", calibrate.main), ("rescore", fame_players.main),
         ("prompts", build_prompts.main), ("schedule", None), ("export", export.main)]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--launch", required=True, help="date of daily #1 (YYYY-MM-DD)")
    ap.add_argument("--days", default="30")
    ap.add_argument("--from", dest="start", choices=[n for n, _ in STEPS], default="ingest_tm")
    ap.add_argument("--skip", action="append", default=[], choices=[n for n, _ in STEPS])
    args = ap.parse_args(argv)
    names = [n for n, _ in STEPS]
    for name, fn in STEPS[names.index(args.start):]:
        if name in args.skip:
            print(f"== {name} (skipped)")
            continue
        t0 = time.time()
        print(f"== {name}")
        code = schedule.main(["--launch", args.launch, "--days", args.days]) if name == "schedule" else fn()
        print(f"   {name} finished in {time.time() - t0:.0f}s (exit {code})")
        if code:
            print(f"Stopped at '{name}'. Fix the issue, then resume with --from {name}.")
            return code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
