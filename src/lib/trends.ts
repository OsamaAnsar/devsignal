import type { Signal } from "../types";

export type TrendCluster = {
  name: string; query: string; signals: Signal[]; sources: string[];
  momentum: number; maturity: number; phase: "Breakout" | "Rising" | "Watching";
  explanation: string;
};

const subjects: Array<[string, string, RegExp]> = [
  ["AI agents", "agent", /\b(ai agent|agents?|agentic|mcp)\b/i],
  ["Language models", "llm", /\b(llm|language model|gpt|gemini|claude|inference)\b/i],
  ["JavaScript", "javascript", /\b(javascript|node\.?js|deno|bun)\b/i],
  ["TypeScript", "typescript", /\btypescript\b/i],
  ["React ecosystem", "react", /\b(react|next\.?js|remix)\b/i],
  ["Cloud infrastructure", "cloud", /\b(cloud|kubernetes|docker|serverless|infrastructure)\b/i],
  ["Databases", "database", /\b(database|postgres|sqlite|vector database|redis)\b/i],
  ["Developer tooling", "developer tool", /\b(cli|sdk|developer tool|ide|editor|compiler)\b/i],
  ["Security", "security", /\b(security|vulnerability|privacy|authentication|encryption)\b/i],
  ["Open source", "open source", /\bopen[ -]source\b/i]
];

export function buildTrendClusters(signals: Signal[]): TrendCluster[] {
  const maxBySource = signals.reduce<Record<string, number>>((all, signal) => ({ ...all, [signal.source]: Math.max(all[signal.source] ?? 1, signal.score) }), {});
  const totalSources = Math.max(1, new Set(signals.map(signal => signal.source)).size);
  return subjects.map(([name, query, pattern]) => {
    const matches = signals.filter(signal => pattern.test(`${signal.title} ${signal.description ?? ""} ${signal.topic}`));
    const sources = [...new Set(matches.map(signal => signal.source))];
    const strength = matches.length ? matches.reduce((sum, signal) => sum + signal.score / maxBySource[signal.source], 0) / matches.length : 0;
    const maturity = Math.min(100, Math.round((sources.length / Math.min(7, totalSources)) * 100));
    const momentum = Math.min(100, Math.round(strength * 62 + Math.min(matches.length, 12) / 12 * 23 + maturity * .15));
    const phase = momentum >= 72 && sources.length >= 3 ? "Breakout" : momentum >= 48 ? "Rising" : "Watching";
    const lead = [...matches].sort((a,b) => (b.score / maxBySource[b.source]) - (a.score / maxBySource[a.source]))[0];
    const explanation = matches.length
      ? `${matches.length} related items across ${sources.length} source${sources.length === 1 ? "" : "s"}${lead ? `, led by “${lead.title}” on ${lead.source}` : ""}.`
      : "No matching evidence in today’s collection.";
    return { name, query, signals: matches, sources, momentum, maturity, phase, explanation } as TrendCluster;
  }).filter(cluster => cluster.signals.length >= 2).sort((a,b) => b.momentum - a.momentum).slice(0, 7);
}
