import { describe, expect, it } from "vitest";
import { buildTrendClusters } from "../src/lib/trends";
import type { Signal } from "../src/types";

const signal = (id: string, title: string, source: Signal["source"], score: number): Signal => ({ id, title, source, score, url: "https://example.com", topic: "Other", sentiment: "neutral" });
describe("trend clusters", () => {
  it("connects evidence across sources", () => {
    const clusters = buildTrendClusters([signal("1", "New AI agent SDK", "GitHub Trending", 100), signal("2", "How agentic tools work", "YouTube", 10), signal("3", "Agent reliability", "arXiv", 8)]);
    expect(clusters[0]).toMatchObject({ name: "AI agents", sources: ["GitHub Trending", "YouTube", "arXiv"] });
    expect(clusters[0].explanation).toContain("3 related items across 3 sources");
  });
});
