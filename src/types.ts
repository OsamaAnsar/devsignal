export type Source = "Hacker News" | "GitHub Trending";
export type Signal = {
  id: string; title: string; url: string; source: Source; score: number;
  language?: string; description?: string; topic: string; sentiment: "positive" | "neutral" | "negative";
  aiTake?: string; confidence?: number;
};
export type Snapshot = { generatedAt: string; mode: "deterministic" | "openai"; model?: string; signals: Signal[]; summary: string[] };
