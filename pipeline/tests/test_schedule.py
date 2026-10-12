from datetime import date

import pandas as pd
import pytest

from jobless import schedule as s


def pool(counts: dict[str, int]):
    rows = [{"prompt_id": f"{slot}{i}", "slot": slot, "pool": "daily", "text": f"{slot} {i}"}
            for slot, n in counts.items() for i in range(n)]
    rows.append({"prompt_id": "u0", "slot": "club_easy", "pool": "unlimited", "text": "unlimited"})
    return pd.DataFrame(rows)


def test_days_follow_the_slot_order_and_never_use_unlimited():
    prompts = pool({"club_easy": 4, "nation_tournament": 4, "non_player": 2, "hard": 4})
    sched, notes = s.extend(prompts, pd.DataFrame(columns=s.COLUMNS), date(2026, 11, 1), 2)
    assert len(sched) == 14 and not notes
    day1 = sched[sched["daily_number"] == 1].sort_values("position")
    slots = day1["prompt_id"].str.rstrip("0123456789").tolist()
    assert slots == s.ORDER
    assert "u0" not in set(sched["prompt_id"])


def test_missing_slot_falls_back_and_is_reported():
    prompts = pool({"club_easy": 2, "nation_tournament": 2, "hard": 2, "flex": 1})
    sched, notes = s.extend(prompts, pd.DataFrame(columns=s.COLUMNS), date(2026, 11, 1), 1)
    assert len(sched) == 7
    assert notes == ["Day 1 slot 4: no 'non_player' prompt left, used 'flex'."]


def test_extending_keeps_existing_days_and_numbers():
    prompts = pool({"club_easy": 4, "nation_tournament": 4, "non_player": 2, "hard": 4})
    first, _ = s.extend(prompts, pd.DataFrame(columns=s.COLUMNS), date(2026, 11, 1), 1)
    both, _ = s.extend(prompts, first, date(2026, 11, 1), 1)
    assert both.iloc[:7].equals(first)
    assert both["daily_number"].tolist()[7:] == [2] * 7
    assert both["air_date"].iloc[7] == date(2026, 11, 2)
    assert both["prompt_id"].is_unique


def test_running_out_stops_cleanly():
    prompts = pool({"club_easy": 2})
    sched, notes = s.extend(prompts, pd.DataFrame(columns=s.COLUMNS), date(2026, 11, 1), 1)
    assert sched.empty and notes[-1].endswith("ran out of daily prompts; stopped.")


def test_a_scheduled_prompt_missing_from_the_pool_is_an_error():
    prompts = pool({"club_easy": 4, "nation_tournament": 4, "non_player": 2, "hard": 4})
    first, _ = s.extend(prompts, pd.DataFrame(columns=s.COLUMNS), date(2026, 11, 1), 1)
    gone = prompts[prompts["prompt_id"] != first["prompt_id"].iloc[0]]
    with pytest.raises(ValueError, match="no longer in the prompt pool"):
        s.extend(gone, first, date(2026, 11, 1), 1)
