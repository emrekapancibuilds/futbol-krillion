import json

from jobless import webdata


def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def make_export(d):
    d.mkdir()
    write_jsonl(d / "entities.jsonl", [
        {"entity_id": "Q1", "type": "player", "name": "Thierry Henry", "fame": 0.9, "fame_rank": 15, "tier": 1, "points": 10},
        {"entity_id": "Q2", "type": "player", "name": "Hugh Glass", "fame": 0.1, "fame_rank": 90000, "tier": 7, "points": 1000},
        {"entity_id": "Q3", "type": "player", "name": "Colin Hendry", "fame": 0.4, "fame_rank": 5000, "tier": 4, "points": 160},
        {"entity_id": "Qc", "type": "club", "name": "Arsenal", "fame": 0.99, "fame_rank": 1, "tier": 1, "points": 10},
    ])
    write_jsonl(d / "entity_names.jsonl", [
        {"entity_id": "Q1", "name": "Thierry Henry", "kind": "canonical"},
        {"entity_id": "Q1", "name": "Titi", "kind": "alias"},
        {"entity_id": "Q1", "name": "Thierry Henry", "kind": "source"},
        {"entity_id": "Q2", "name": "Hugh Glass", "kind": "canonical"},
        {"entity_id": "Q3", "name": "Colin Hendry", "kind": "canonical"},
        {"entity_id": "Qc", "name": "Arsenal", "kind": "canonical"},
    ])
    write_jsonl(d / "prompts.jsonl", [
        {"prompt_id": "pA", "family": "club", "entity_type": "player", "text": "Name a player who played for Arsenal",
         "pool": "daily", "slot": "club_easy", "ease": 0.5, "n_answers": 2},
        {"prompt_id": "pB", "family": "club", "entity_type": "player", "text": "Unscheduled", "pool": "daily",
         "slot": "hard", "ease": 0.1, "n_answers": 1},
    ])
    write_jsonl(d / "prompt_answers.jsonl", [
        {"prompt_id": "pA", "entity_id": "Q2", "tier": 7, "points": 1000, "fact": "Arsenal, 1899–1900"},
        {"prompt_id": "pA", "entity_id": "Q1", "tier": 1, "points": 10, "fact": "254 apps for Arsenal, 1999–2007"},
        {"prompt_id": "pB", "entity_id": "Q3", "tier": 4, "points": 160, "fact": "x"},
    ])
    write_jsonl(d / "schedule.jsonl", [
        {"air_date": "2026-10-11", "daily_number": 1, "position": 2, "prompt_id": "pA"},
        {"air_date": "2026-10-11", "daily_number": 1, "position": 1, "prompt_id": "pA"},
    ])
    (d / "meta.json").write_text(json.dumps({"tm_snapshot": "2026-07-06"}))


def test_days_list_prompts_in_position_order(tmp_path):
    make_export(tmp_path / "export")
    webdata.build(tmp_path / "export", tmp_path / "web")
    days = json.loads((tmp_path / "web" / "days.json").read_text())
    assert days == [{"number": 1, "date": "2026-10-11", "prompts": ["pA", "pA"]}]


def test_only_scheduled_prompts_get_answer_files_with_deduped_variants(tmp_path):
    make_export(tmp_path / "export")
    webdata.build(tmp_path / "export", tmp_path / "web")
    assert sorted(p.name for p in (tmp_path / "web" / "prompts").iterdir()) == ["pA.json"]
    prompt = json.loads((tmp_path / "web" / "prompts" / "pA.json").read_text(encoding="utf-8"))
    assert prompt["text"] == "Name a player who played for Arsenal" and prompt["entityType"] == "player"
    first, second = prompt["answers"]                     # most famous first
    assert (first["id"], first["name"], first["tier"], first["points"]) == ("Q1", "Thierry Henry", 1, 10)
    assert first["variants"] == ["Thierry Henry", "Titi"]
    assert second["fact"] == "Arsenal, 1899–1900"


def test_name_index_covers_every_entity_of_the_prompt_types(tmp_path):
    make_export(tmp_path / "export")
    webdata.build(tmp_path / "export", tmp_path / "web")
    index = json.loads((tmp_path / "web" / "names-player.json").read_text(encoding="utf-8"))
    assert ["Q3", "Colin Hendry"] in index and ["Q1", "Titi"] in index
    assert not (tmp_path / "web" / "names-club.json").exists()    # no scheduled club prompts
    meta = json.loads((tmp_path / "web" / "meta.json").read_text())
    assert meta["tm_snapshot"] == "2026-07-06" and meta["days"] == 1


def test_a_rebuild_removes_files_from_the_previous_build(tmp_path):
    make_export(tmp_path / "export")
    (tmp_path / "web" / "prompts").mkdir(parents=True)
    (tmp_path / "web" / "prompts" / "pOld.json").write_text("{}")
    (tmp_path / "web" / "names-stadium.json").write_text("[]")
    webdata.build(tmp_path / "export", tmp_path / "web")
    assert sorted(p.name for p in (tmp_path / "web" / "prompts").iterdir()) == ["pA.json"]
    assert not (tmp_path / "web" / "names-stadium.json").exists()


def test_unlimited_prompts_are_exported_with_their_answers_and_names(tmp_path, monkeypatch):
    """The free-for-now Unlimited mode plays prompts from the unlimited pool; never an unaired daily."""
    make_export(tmp_path / "export")
    d = tmp_path / "export"
    rows = [json.loads(l) for l in (d / "prompts.jsonl").read_text().splitlines()]
    rows += [{"prompt_id": "pU1", "family": "club", "entity_type": "club", "text": "Name a club", "pool": "unlimited",
              "slot": "flex", "ease": 0.5, "n_answers": 1},
             {"prompt_id": "pU2", "family": "club", "entity_type": "player", "text": "Name a Hull player",
              "pool": "unlimited", "slot": "flex", "ease": 0.5, "n_answers": 1}]
    write_jsonl(d / "prompts.jsonl", rows)
    answers = [json.loads(l) for l in (d / "prompt_answers.jsonl").read_text().splitlines()]
    answers += [{"prompt_id": "pU1", "entity_id": "Qc", "tier": 1, "points": 10, "fact": "x"},
                {"prompt_id": "pU2", "entity_id": "Q3", "tier": 4, "points": 160, "fact": "x"}]
    write_jsonl(d / "prompt_answers.jsonl", answers)

    webdata.build(d, tmp_path / "web")
    web = tmp_path / "web"
    assert sorted(json.loads((web / "unlimited.json").read_text())["all"]) == ["pU1", "pU2"]
    assert (web / "prompts" / "pU1.json").exists() and not (web / "prompts" / "pB.json").exists()
    assert (web / "names-club.json").exists()

    monkeypatch.setattr(webdata, "UNLIMITED_EXPORT", 1)
    webdata.build(d, web)
    assert len(json.loads((web / "unlimited.json").read_text())["all"]) == 1


def test_free_unlimited_skips_hard_prompts(tmp_path):
    make_export(tmp_path / "export")
    d = tmp_path / "export"
    rows = [json.loads(l) for l in (d / "prompts.jsonl").read_text().splitlines()]
    rows += [{"prompt_id": "pEasy", "family": "club", "entity_type": "player", "text": "Name a Real Madrid player",
              "pool": "unlimited", "slot": "flex", "ease": 0.5, "n_answers": 1, "famous": webdata.UNLIMITED_MIN_FAMOUS,
              "mainstream": True},
             {"prompt_id": "pHard", "family": "club_position", "entity_type": "player", "text": "Name a Cesena midfielder",
              "pool": "unlimited", "slot": "hard", "ease": 0.1, "n_answers": 1, "famous": 3, "mainstream": True},
             {"prompt_id": "pNiche", "family": "club", "entity_type": "player", "text": "Name a Pescara player",
              "pool": "unlimited", "slot": "flex", "ease": 0.3, "n_answers": 1, "famous": 60, "mainstream": False}]
    write_jsonl(d / "prompts.jsonl", rows)
    answers = [json.loads(l) for l in (d / "prompt_answers.jsonl").read_text().splitlines()]
    answers += [{"prompt_id": p, "entity_id": "Q1", "tier": 1, "points": 10, "fact": "x"} for p in ("pEasy", "pHard", "pNiche")]
    write_jsonl(d / "prompt_answers.jsonl", answers)
    webdata.build(d, tmp_path / "web")
    assert json.loads((tmp_path / "web" / "unlimited.json").read_text())["all"] == ["pEasy"]


def test_unlimited_is_grouped_by_round_type(tmp_path):
    make_export(tmp_path / "export")
    d = tmp_path / "export"
    rows = [json.loads(l) for l in (d / "prompts.jsonl").read_text().splitlines()]
    def unl(pid, cat):
        return {"prompt_id": pid, "family": "club", "entity_type": "player", "text": pid, "pool": "unlimited", "slot": "flex",
                "ease": 0.5, "n_answers": 1, "famous": webdata.UNLIMITED_MIN_FAMOUS, "mainstream": True, "category": cat}
    rows += [unl("pPL", "premier-league"), unl("pPL2", "premier-league"), unl("pINT", "international"), unl("pNone", None)]
    write_jsonl(d / "prompts.jsonl", rows)
    answers = [json.loads(l) for l in (d / "prompt_answers.jsonl").read_text().splitlines()]
    answers += [{"prompt_id": p, "entity_id": "Q1", "tier": 1, "points": 10, "fact": "x"} for p in ("pPL", "pPL2", "pINT", "pNone")]
    write_jsonl(d / "prompt_answers.jsonl", answers)
    webdata.build(d, tmp_path / "web")
    u = json.loads((tmp_path / "web" / "unlimited.json").read_text())
    assert sorted(u["all"]) == ["pINT", "pNone", "pPL", "pPL2"]
    assert sorted(u["categories"]["premier-league"]) == ["pPL", "pPL2"]
    assert u["categories"]["international"] == ["pINT"]


def test_unlimited_lists_what_each_prompt_is_about(tmp_path):
    """So a set of 7 does not ask about the same club twice ('Hertha BSC', then 'Hertha BSC (1992-2026)')."""
    make_export(tmp_path / "export")
    d = tmp_path / "export"
    rows = [json.loads(l) for l in (d / "prompts.jsonl").read_text().splitlines()]
    def unl(pid, key):
        return {"prompt_id": pid, "key": key, "family": "club", "entity_type": "player", "text": pid, "pool": "unlimited",
                "slot": "flex", "ease": 0.5, "n_answers": 1, "famous": webdata.UNLIMITED_MIN_FAMOUS, "mainstream": True,
                "category": "bundesliga"}
    rows += [unl("p1", "club:Q64:all"), unl("p2", "club:Q64:1992"), unl("p3", "clubpos:Q64:FW"), unl("p4", "leaguepos:bundesliga:FW"),
             unl("p5", "intl:Q43310"), unl("p6", "scored:2014 World Cup")]
    write_jsonl(d / "prompts.jsonl", rows)
    answers = [json.loads(l) for l in (d / "prompt_answers.jsonl").read_text().splitlines()]
    answers += [{"prompt_id": f"p{i}", "entity_id": "Q1", "tier": 1, "points": 10, "fact": "x"} for i in range(1, 7)]
    write_jsonl(d / "prompt_answers.jsonl", answers)
    webdata.build(d, tmp_path / "web")
    subjects = json.loads((tmp_path / "web" / "unlimited.json").read_text())["subjects"]
    assert subjects["p1"] == subjects["p2"] == subjects["p3"] == "club:Q64"
    assert (subjects["p4"], subjects["p5"], subjects["p6"]) == ("league:bundesliga", "nation:Q43310", "tournament")
