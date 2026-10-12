from jobless import run_all


def test_run_all_stops_at_first_failing_step_and_resumes_from(monkeypatch):
    calls = []
    steps = [(n, (lambda n=n: calls.append(n) or (2 if n == "calibrate" else 0))) for n, _ in run_all.STEPS]
    monkeypatch.setattr(run_all, "STEPS", steps)
    monkeypatch.setattr(run_all.schedule, "main", lambda argv: calls.append("schedule") or 0)
    assert run_all.main(["--launch", "2026-11-01"]) == 2
    assert calls[-1] == "calibrate"
    calls.clear()
    assert run_all.main(["--launch", "2026-11-01", "--from", "rescore"]) == 0
    assert calls == ["rescore", "prompts", "schedule", "export"]
    calls.clear()
    assert run_all.main(["--launch", "2026-11-01", "--from", "pageviews", "--skip", "pageviews", "--skip", "calibrate"]) == 0
    assert "pageviews" not in calls and "calibrate" not in calls and calls[0] == "merge"
