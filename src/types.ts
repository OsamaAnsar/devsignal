export type Source = "Hacker News" | "GitHub Trending" | "Reddit" | "npm Registry" | "DEV Community" | "Lobsters" | "X";
export type Signal = {
  id: string; title: string; url: string; source: Source; score: number;
  language?: string; description?: string; topic: string; sentiment: "positive" | "neutral" | "negative";
  aiTake?: string; confidence?: number; metric?: "points" | "stars" | "reactions" | "downloads" | "rank" | "engagement";
};
export type Snapshot = { generatedAt: string; mode: "deterministic" | "openai"; model?: string; signals: Signal[]; summary: string[] };
