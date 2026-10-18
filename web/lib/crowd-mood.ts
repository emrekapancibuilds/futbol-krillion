// How the stands react to a round (user, 2026-10-11): a pass, a timeout or a Bandwagon / Glory Hunter answer is a
// missed chance, so the crowd groans and settles; Part-Time Fan and up get cheered, louder and more frantic per tier.

export type Mood = "normal" | "calm" | "hype";
export type Reaction = { mood: Mood; sound: "groan" | "cheer"; strength: number; beatMs: number };

const CALM: Reaction = { mood: "calm", sound: "groan", strength: 1, beatMs: 0 };

export function crowdReaction(status: "accepted" | "missed" | "passed", tier: number | null): Reaction {
  if (status !== "accepted" || !tier || tier <= 2) return CALM;
  const level = Math.min(5, tier - 2);           // 1 (Part-Time Fan) .. 5 (Jobless)
  return { mood: "hype", sound: "cheer", strength: level / 5, beatMs: Math.round(780 - level * 95) };
}
