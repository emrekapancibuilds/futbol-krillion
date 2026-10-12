"""Name folding and date helpers shared by the merge and derive steps."""
import re
import unicodedata

CLUB_NOISE = {"fc", "afc", "cf", "sc", "f", "c", "club", "football"}


def fold(text: str) -> str:
    """Lowercase ASCII form used to compare names across sources: 'Mesut Özil' -> 'mesut ozil'."""
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def club_fold(text: str) -> str:
    """fold() without suffix noise, so 'Burnley F.C.' and 'Burnley FC' compare equal."""
    return " ".join(t for t in fold(text).split() if t not in CLUB_NOISE)


CLUB_AFFIX = re.compile(r"^(?:A\.?F\.?C\.?|F\.?C\.?|C\.?F\.?)\s+|\s+(?:A\.?F\.?C\.?|F\.?C\.?|C\.?F\.?)$")


def club_display(name: str) -> str:
    """Short name for prompt text: 'Chelsea FC' -> 'Chelsea', 'FC Barcelona' -> 'Barcelona'.
    Only a leading/trailing FC, F.C., CF or AFC is removed, so 'AC Milan' and '1. FC Köln' stay as they are."""
    return CLUB_AFFIX.sub("", name.strip()).strip() or name


DEFUNCT_MARK = re.compile(r"\s*\(-?\d{4}\)$")   # Transfermarkt's "Kuban Krasnodar (-2018)"


def _latin(text: str) -> bool:
    return all(unicodedata.name(ch, "").startswith("LATIN") for ch in text if ch.isalpha())


def club_short_name(forms) -> str | None:
    """Prompt name for a club from all its known forms (Transfermarkt name first, then the Wikidata label):
    the shortest Latin-script club_display() form, so 'PAOK FC' beats 'Panthessalonikios Athlitikos Omilos...'
    and 'FC Lokomotiv Moscow' beats the Cyrillic name. Ties go to the earlier form."""
    shown = [club_display(DEFUNCT_MARK.sub("", f).strip()) for f in forms if isinstance(f, str) and f.strip()]
    if not shown:
        return None
    return min([s for s in shown if _latin(s)] or shown, key=len)


def year(value) -> float:
    """First four digits of an ISO-ish date string as a float year, NaN when absent."""
    if isinstance(value, str) and len(value) >= 4 and value[:4].isdigit():
        return float(value[:4])
    return float("nan")
