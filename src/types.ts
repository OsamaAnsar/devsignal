export type Source = "Hacker News" | "GitHub Trending";
export type Signal = {
  id: string; title: string; url: string; source: Source; score: number;
  language?: string; description?: string; topic: string; sentiment: "positive" | "neutral" | "negative";
};
export type Snapshot = { generatedAt: string; mode: "deterministic" | "openai"; signals: Signal[]; summary: string[] };
