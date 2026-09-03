import * as cheerio from "cheerio";
import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import { makeSignal, summarize } from "../src/lib/analyze.ts";
import type { Signal, Snapshot } from "../src/types.ts";

const headers = { "User-Agent": "DevSignal/1.0 (+https://github.com/OsamaAnsar/devsignal)" };
async function html(url: string) { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); }

export function parseHackerNews(body: string): Signal[] {
  const $ = cheerio.load(body); const rows = $("tr.athing").toArray();
  return rows.slice(0, 20).map((row) => {
    const link = $(row).find(".titleline > a").first(); const id = $(row).attr("id") ?? link.text();
    const scoreText = $(row).next().find(".score").text();
    return makeSignal({ id: `hn-${id}`, title: link.text().trim(), url: link.attr("href") ?? "https://news.ycombinator.com", source: "Hacker News", score: Number(scoreText.match(/\d+/)?.[0] ?? 0) });
  });
}

export function parseGitHubTrending(body: string): Signal[] {
  const $ = cheerio.load(body);
  return $("article.Box-row").toArray().slice(0, 20).map((row, index) => {
    const path = $(row).find("h2 a").attr("href")?.trim() ?? ""; const title = path.replace(/^\//, "").replace("/", " / ");
    const stars = $(row).find('a[href$="/stargazers"]').text().replace(/,/g, "").trim();
    return makeSignal({ id: `gh-${index}-${path}`, title, url: `https://github.com${path}`, source: "GitHub Trending", score: Number(stars) || 0, language: $(row).find('[itemprop="programmingLanguage"]').text().trim() || undefined, description: $(row).find("p").text().replace(/\s+/g, " ").trim() });
  });
}

const AI_MODEL = "gpt-5-mini";
const analysisSchema = {
  type: "object", additionalProperties: false,
  properties: {
    items: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, topic: { type: "string" },
        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
        aiTake: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["id", "topic", "sentiment", "aiTake", "confidence"]
    } },
    summary: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } }
  },
  required: ["items", "summary"]
} as const;

async function enhanceWithAi(signals: Signal[]): Promise<{ signals: Signal[]; summary: string[]; model: string } | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI();
  try {
    const response = await client.responses.create({
      model: AI_MODEL, store: false,
      instructions: "You are a restrained technology analyst. Classify only from the supplied data. Avoid hype. aiTake explains why a developer may care in one plain-English sentence under 22 words.",
      input: JSON.stringify(signals.map(({ id, title, source, score, language, description }) => ({ id, title, source, score, language, description }))),
      text: { format: { type: "json_schema", name: "developer_signal_analysis", strict: true, schema: analysisSchema } }
    });
    const parsed = JSON.parse(response.output_text) as { items: Array<Pick<Signal, "id" | "topic" | "sentiment" | "aiTake" | "confidence">>; summary: string[] };
    const byId = new Map(parsed.items.map(item => [item.id, item]));
    return { signals: signals.map(signal => ({ ...signal, ...(byId.get(signal.id) ?? {}) })), summary: parsed.summary, model: AI_MODEL };
  } catch (error) {
    console.warn("OpenAI enrichment failed; publishing deterministic analysis instead.", error);
    return null;
  }
}

async function main() {
  const settled = await Promise.allSettled([html("https://news.ycombinator.com/"), html("https://github.com/trending?since=daily")]);
  const signals = [settled[0].status === "fulfilled" ? parseHackerNews(settled[0].value) : [], settled[1].status === "fulfilled" ? parseGitHubTrending(settled[1].value) : []].flat();
  if (!signals.length) throw new Error("All scraper sources failed; preserving the previous snapshot.");
  const ai = await enhanceWithAi(signals); const snapshot: Snapshot = { generatedAt: new Date().toISOString(), mode: ai ? "openai" : "deterministic", model: ai?.model, signals: ai?.signals ?? signals, summary: ai?.summary ?? summarize(signals) };
  await mkdir("public/data", { recursive: true }); await writeFile("public/data/snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Collected ${signals.length} signals (${snapshot.mode} analysis).`);
}
if (process.argv[1]?.includes("scrape")) main().catch(e => { console.error(e); process.exit(1); });
