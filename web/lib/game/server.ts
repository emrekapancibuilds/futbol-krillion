// Server-only access to the packaged game data in ./data (see pipeline/jobless/webdata.py).
import fs from "node:fs";
import path from "node:path";

import type { NameRow } from "../matching/match.ts";
import type { Day, GameData, PromptData } from "./engine.ts";

const DIR = path.join(process.cwd(), "data");
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as T;

let cached: GameData | null = null;
const prompts = new Map<string, PromptData>();
const names = new Map<string, NameRow[]>();

export function gameData(): GameData {
  cached ??= {
    days: read<Day[]>("days.json"),
    ...unlimitedData(),
    prompt: (id) => {
      if (!/^p[0-9a-f]{10}$/.test(id)) throw new Error(`bad prompt id ${id}`);
      if (!prompts.has(id)) prompts.set(id, read<PromptData>(`prompts/${id}.json`));
      return prompts.get(id)!;
    },
    names: (type) => {
      if (!/^[a-z]+$/.test(type)) throw new Error(`bad entity type ${type}`);
      if (!names.has(type)) names.set(type, fs.existsSync(path.join(DIR, `names-${type}.json`)) ? read<NameRow[]>(`names-${type}.json`) : []);
      return names.get(type)!;
    },
  };
  return cached;
}

function unlimitedData(): Pick<GameData, "unlimited" | "categories" | "subjects"> {
  if (!fs.existsSync(path.join(DIR, "unlimited.json"))) return { unlimited: [], categories: {}, subjects: {} };
  const u = read<{ all: string[]; categories: Record<string, string[]>; subjects?: Record<string, string> }>("unlimited.json");
  return { unlimited: u.all, categories: u.categories, subjects: u.subjects ?? {} };
}

export function gameSecret(): string {
  const s = process.env.GAME_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("GAME_SECRET is not set");
  return "dev-only-secret";
}

export function snapshotDate(): string {
  return read<{ tm_snapshot: string }>("meta.json").tm_snapshot;
}
