"""Quality checks and near-duplicate removal for generated prompts (spec §5)."""
from collections import Counter

from jobless.config import TEAM_MIN_ANSWERS

# Rule set D (user call 2026-10-11). The original "at least 5 Bandwagon answers" rejected every club outside
# about 40 giants (248 prompts, 21 days of dailies); D gives ~1,700 prompts while keeping the intent:
# casual fans can always score, there is a spread of harder answers, and a Jobless answer exists.
EASY_TIERS = (1, 2, 3)    # Part-Time Fan or easier
MIN_EASY = 5
MID_TIERS = (4, 5)        # Season Ticket Holder, True Analyst
MIN_PER_MID_TIER = 2
MIN_JOBLESS = 1
MAX_OVERLAP = 0.7         # Jaccard
# The light check, for prompts whose answers are almost all famous (tournament scorers): easy answers plus a few
# rarer ones, but no Jobless answer is required.
LIGHT_MIN_RARE = 3        # answers in tier 4 or above


def check(tiers: list[int], light: bool = False) -> str | None:
    """None when the prompt passes; otherwise the first rule it fails."""
    c = Counter(tiers)
    if sum(c[t] for t in EASY_TIERS) < MIN_EASY:
        return "fewer than 5 easy answers"
    if light:
        rare = sum(c[t] for t in range(4, 8))
        return None if rare >= LIGHT_MIN_RARE else "fewer than 3 answers in tier 4 or above"
    for t in MID_TIERS:
        if c[t] < MIN_PER_MID_TIER:
            return f"fewer than 2 tier-{t} answers"
    if c[7] < MIN_JOBLESS:
        return "no Jobless answer"
    return None


def check_team(tiers: list[int], cap: int) -> str | None:
    """Team prompts (a World Cup field, a league's clubs): small categories can't have a Jobless answer, so the check
    is relative to the category's own top tier (config.TEAM_CAPS) instead of rule set D."""
    if len(tiers) < TEAM_MIN_ANSWERS:
        return "too few teams"
    c = Counter(tiers)
    if sum(c[t] for t in EASY_TIERS) < MIN_EASY:
        return "fewer than 5 easy answers"
    if c[cap] < 1:
        return "nobody reaches the category's top tier"
    return None


def dedupe(items: list[tuple[str, set]], threshold: float = MAX_OVERLAP) -> list[str]:
    """Greedy, in the given order: keep an item unless its Jaccard overlap with a kept one exceeds threshold."""
    kept, kept_sets = [], []
    for key, s in items:
        clash = False
        for ks in kept_sets:
            small, big = sorted((len(s), len(ks)))
            if big == 0 or small / big <= threshold:   # Jaccard can't exceed small/big
                continue
            inter = len(s & ks)
            if inter / (len(s) + len(ks) - inter) > threshold:
                clash = True
                break
        if not clash:
            kept.append(key)
            kept_sets.append(s)
    return kept
