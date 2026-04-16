export interface ScoringRule {
  points: number;
  keywords: string[];
}

export interface ComboRule {
  points: number;
  groupA: string[];
  groupB: string[];
}

export interface RadarConfig {
  searches: Array<{ query: string; interval: "daily" | "weekly" | "monthly" }>;
  scoringRules: ScoringRule[];
  comboRules: ComboRule[];
  scoreThreshold: number;
}

export const DEFAULT_CONFIG: RadarConfig = {
  searches: [
    { query: "x402", interval: "daily" },
    { query: "erc-8004 agent", interval: "daily" },
    { query: "erc8004", interval: "daily" },
    { query: "x402 payment facilitator", interval: "weekly" },
    { query: "stablecoin EUR settlement", interval: "weekly" },
    { query: "EURC payment", interval: "weekly" },
    { query: "agentic commerce payment", interval: "weekly" },
    { query: "mcp server payment", interval: "weekly" },
    { query: "ai agent micropayment", interval: "weekly" },
    { query: "telecom API payment", interval: "weekly" },
    { query: "CAMARA open gateway", interval: "monthly" },
    { query: "pay-to-reach", interval: "monthly" },
    { query: "x402 facilitator", interval: "weekly" },
    { query: "agent trust score blockchain", interval: "weekly" },
  ],
  scoringRules: [
    { points: 3, keywords: ["x402"] },
    { points: 3, keywords: ["erc-8004", "erc8004"] },
    { points: 2, keywords: ["facilitator"] },
    { points: 2, keywords: ["eurc", "eur settlement", "sepa"] },
    { points: 2, keywords: ["mica", "mica compliance"] },
    { points: 1, keywords: ["telecom", "telco", "voip", "camara"] },
    { points: 1, keywords: ["marketplace", "bazaar"] },
  ],
  comboRules: [
    {
      points: 2,
      groupA: ["payment", "payments"],
      groupB: ["agent", "agentic", "ai agent", "ai-agent"],
    },
  ],
  scoreThreshold: 4,
};

let activeConfig: RadarConfig = structuredClone(DEFAULT_CONFIG);

export function getConfig(): RadarConfig {
  return activeConfig;
}

export function mergeConfig(patch: Partial<RadarConfig>): RadarConfig {
  if (patch.searches) activeConfig.searches = patch.searches;
  if (patch.scoringRules) activeConfig.scoringRules = patch.scoringRules;
  if (patch.comboRules) activeConfig.comboRules = patch.comboRules;
  if (patch.scoreThreshold !== undefined)
    activeConfig.scoreThreshold = patch.scoreThreshold;
  return activeConfig;
}

export function resetConfig(): RadarConfig {
  activeConfig = structuredClone(DEFAULT_CONFIG);
  return activeConfig;
}
