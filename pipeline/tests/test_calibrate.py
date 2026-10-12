import numpy as np
import pandas as pd

from jobless import calibrate
from jobless.config import FAME_WEIGHTS
from jobless.fame_players import score


def synthetic(n=1000, seed=3):
    rng = np.random.default_rng(seed)
    comp = pd.DataFrame(rng.random((n, 6)), columns=list(FAME_WEIGHTS), index=[f"p{i}" for i in range(n)])
    comp["era"] = 1.0
    truth = score(comp, {k: (1.0 if k == "attention" else 0.0) for k in FAME_WEIGHTS})["tier"]
    return comp, truth


def test_agreement_counts_exact_and_within_one():
    labels = pd.Series([1, 2, 3, 4], index=list("abcd"))
    pred = pd.Series([1, 3, 5, 4], index=list("abcd"))
    assert calibrate.agreement(pred, labels) == (0.5, 0.75)


def test_fit_moves_weight_towards_the_component_that_explains_the_labels():
    comp, truth = synthetic()
    labels = truth.sample(300, random_state=1)
    before = calibrate.agreement(score(comp)["tier"], labels)[0]
    weights, _ = calibrate.fit(comp, labels)
    after = calibrate.agreement(score(comp, weights)["tier"], labels)[0]
    assert after > before
    assert max(weights, key=weights.get) == "attention"
    assert abs(sum(weights.values()) - 1) < 1e-9


def test_sample_draft_has_blank_tier_column_and_context():
    comp, _ = synthetic(n=200)
    scored = score(comp)
    players = pd.DataFrame({"player_id": comp.index, "name": [f"Player {i}" for i in range(200)],
                            "first_year": 2000.0, "last_year": 2010.0})
    stints = pd.DataFrame({"player_id": ["p0", "p0"], "club_id": ["c1", "c2"], "apps": [10.0, 50.0]})
    clubs = pd.DataFrame({"club_id": ["c1", "c2"], "name": ["Club One", "Club Two"]})
    draft = calibrate.sample(scored, players, stints, clubs, per_tier=5)
    assert (draft["tier"] == "").all()
    assert draft.groupby("provisional_tier").size().max() <= 5


def test_top_clubs_orders_by_appearances():
    stints = pd.DataFrame({"player_id": ["p0", "p0", "p0"], "club_id": ["c1", "c2", "c1"], "apps": [10.0, 50.0, 5.0]})
    clubs = pd.DataFrame({"club_id": ["c1", "c2"], "name": ["Club One", "Club Two"]})
    assert calibrate.top_clubs(stints, clubs)["p0"] == "Club Two / Club One"


def test_missing_the_agreement_target_warns_without_stopping_the_run():
    """The user accepted 49.5% / 88.7% on 2026-10-11; run_all stops on any non-zero exit."""
    assert calibrate.exit_code(0.495, 0.887) == 0
    assert calibrate.exit_code(0.80, 0.97) == 0
