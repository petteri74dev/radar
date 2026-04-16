import type { ScoringRule, ComboRule } from "./config.js";

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function scoreRepo(
  description: string,
  topics: string[],
  readme: string,
  scoringRules: ScoringRule[],
  comboRules: ComboRule[]
): ScoreResult {
  const text = [description || "", topics.join(" "), readme || ""]
    .join(" ")
    .toLowerCase();

  let total = 0;
  const reasons: string[] = [];

  for (const rule of scoringRules) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        total += rule.points;
        reasons.push(kw);
        break;
      }
    }
  }

  for (const combo of comboRules) {
    const aHit = combo.groupA.some((k) => text.includes(k));
    const bHit = combo.groupB.some((k) => text.includes(k));
    if (aHit && bHit) {
      total += combo.points;
      reasons.push(`${combo.groupA[0]}+${combo.groupB[0]} combo`);
    }
  }

  if (!description || description.length < 10) {
    total -= 1;
    reasons.push("no description");
  }

  return { score: total, reasons };
}
