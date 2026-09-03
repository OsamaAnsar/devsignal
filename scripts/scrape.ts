import * as cheerio from "cheerio";
import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import { makeSignal, summarize } from "../src/lib/analyze.ts";
import type { Signal, Snapshot } from "../src/types.ts";

const headers = { "User-Agent": "DevSignal/1.0 (+https://github.com/OsamaAnsar/devsignal)" };
async function html(url: string) { const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); }
async function json<T>(url: string, extraHeaders: Record<string, string> = {}) { const r = await fetch(url, { headers: { ...headers, ...extraHeaders } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() as Promise<T>; }

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

type RedditListing = { data: { children: Array<{ data: { id: string; title: string; permalink: string; url?: string; score: number; num_comments: number; subreddit: string } }> } };
export function parseRedditListing(listing: RedditListing): Signal[] {
  return listing.data.children.map(({ data }) => makeSignal({ id: `reddit-${data.id}`, title: data.title, url: data.url ?? `https://www.reddit.com${data.permalink}`, source: "Reddit", score: data.score + data.num_comments, metric: "engagement", description: `r/${data.subreddit} · ${data.num_comments} comments` }));
}
async function scrapeReddit(): Promise<Signal[]> {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return [];
  const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { ...headers, Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!tokenResponse.ok) throw new Error(`Reddit OAuth: ${tokenResponse.status}`);
  const token = await tokenResponse.json() as { access_token: string };
  const listing = await json<RedditListing>("https://oauth.reddit.com/r/programming+webdev+javascript+MachineLearning/hot?limit=15&raw_json=1", { Authorization: `Bearer ${token.access_token}` });
  return parseRedditListing(listing);
}

type NpmSearch = { objects: Array<{ package: { name: string; description?: string; links?: { npm?: string }; keywords?: string[] }; downloads?: { weekly?: number } }> };
async function scrapeNpm(): Promise<Signal[]> {
  const data = await json<NpmSearch>("https://registry.npmjs.org/-/v1/search?text=keywords%3Ajavascript%20keywords%3Atypescript%20keywords%3Aai&size=15&popularity=1&quality=.3&maintenance=.3");
  return data.objects.map((item, index) => makeSignal({ id: `npm-${item.package.name}`, title: item.package.name, url: item.package.links?.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(item.package.name)}`, source: "npm Registry", score: item.downloads?.weekly ?? 0, metric: "downloads", language: "JavaScript", description: item.package.description }));
}

type DevArticle = { id: number; title: string; url: string; description?: string; positive_reactions_count: number; comments_count: number; tag_list?: string[] };
async function scrapeDev(): Promise<Signal[]> {
  const data = await json<DevArticle[]>("https://dev.to/api/articles?top=1&per_page=15");
  return data.map(item => makeSignal({ id: `dev-${item.id}`, title: item.title, url: item.url, source: "DEV Community", score: item.positive_reactions_count + item.comments_count, metric: "reactions", description: item.description, language: item.tag_list?.find(tag => /javascript|typescript|python|rust|go/i.test(tag)) }));
}

type LobsterStory = { short_id: string; title: string; url: string; score: number; comment_count: number; tags?: string[]; description?: string };
async function scrapeLobsters(): Promise<Signal[]> {
  const data = await json<LobsterStory[]>("https://lobste.rs/hottest.json");
  return data.slice(0, 15).map(item => makeSignal({ id: `lobsters-${item.short_id}`, title: item.title, url: item.url, source: "Lobsters", score: item.score + item.comment_count, metric: "points", description: item.description ?? item.tags?.join(", ") }));
}

export function parseArxivFeed(body: string): Signal[] {
  const $ = cheerio.load(body, { xmlMode: true });
  return $("entry").toArray().slice(0, 15).map((entry, index) => {
    const url = $(entry).find("id").text().trim();
    const categories = $(entry).find("category").toArray().map(node => $(node).attr("term")).filter(Boolean).join(", ");
    const abstract = $(entry).find("summary").text().replace(/\s+/g, " ").trim();
    return makeSignal({ id: `arxiv-${url.split("/").pop() ?? index}`, title: $(entry).find("title").text().replace(/\s+/g, " ").trim(), url, source: "arXiv", score: 15 - index, metric: "rank", description: `${abstract.slice(0, 280)}${abstract.length > 280 ? "…" : ""}${categories ? ` · ${categories}` : ""}` });
  });
}
async function scrapeArxiv(): Promise<Signal[]> {
  const query = encodeURIComponent("cat:cs.AI OR cat:cs.SE OR cat:cs.CL");
  return parseArxivFeed(await html(`https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=15&sortBy=submittedDate&sortOrder=descending`));
}

type StackQuestions = { items: Array<{ question_id: number; title: string; link: string; score: number; answer_count: number; view_count: number; tags: string[] }> };
async function scrapeStackOverflow(): Promise<Signal[]> {
  const data = await json<StackQuestions>("https://api.stackexchange.com/2.3/questions?site=stackoverflow&pagesize=15&order=desc&sort=hot&tagged=javascript");
  return data.items.map(item => makeSignal({ id: `so-${item.question_id}`, title: item.title.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&"), url: item.link, source: "Stack Overflow", score: Math.max(0, item.score) + item.answer_count * 2 + Math.round(item.view_count / 100), metric: "engagement", language: item.tags.find(tag => /javascript|typescript|python|rust|java|go|c\+\+/i.test(tag)), description: `${item.answer_count} answers · ${item.view_count.toLocaleString()} views · ${item.tags.slice(0, 4).join(", ")}` }));
}

export function parseInfoQFeed(body: string): Signal[] {
  const $ = cheerio.load(body, { xmlMode: true });
  return $("item").toArray().slice(0, 15).map((item, index) => {
    const description = cheerio.load($(item).find("description").text()).text().replace(/\s+/g, " ").trim();
    return makeSignal({ id: `infoq-${index}-${$(item).find("guid").text().trim()}`, title: $(item).find("title").text().trim(), url: $(item).find("link").text().trim(), source: "InfoQ", score: 15 - index, metric: "rank", description: description.slice(0, 280) });
  });
}
async function scrapeInfoQ(): Promise<Signal[]> { return parseInfoQFeed(await html("https://feed.infoq.com/")); }

type XSearch = { data?: Array<{ id: string; text: string; public_metrics?: { like_count: number; repost_count: number; reply_count: number } }> };
async function scrapeX(): Promise<Signal[]> {
  if (!process.env.X_BEARER_TOKEN) return [];
  const query = encodeURIComponent('(javascript OR typescript OR react OR "open source" OR "AI agent") -is:retweet lang:en');
  const data = await json<XSearch>(`https://api.x.com/2/tweets/search/recent?query=${query}&max_results=10&tweet.fields=public_metrics`, { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` });
  return (data.data ?? []).map(item => { const m = item.public_metrics; return makeSignal({ id: `x-${item.id}`, title: item.text.replace(/\s+/g, " ").slice(0, 180), url: `https://x.com/i/web/status/${item.id}`, source: "X", score: (m?.like_count ?? 0) + (m?.repost_count ?? 0) * 2 + (m?.reply_count ?? 0), metric: "engagement" }); });
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
  const tasks: Array<[string, Promise<Signal[]>]> = [
    ["Hacker News", html("https://news.ycombinator.com/").then(parseHackerNews)],
    ["GitHub Trending", html("https://github.com/trending?since=daily").then(parseGitHubTrending)],
    ["Reddit", scrapeReddit()],
    ["npm Registry", scrapeNpm()], ["DEV Community", scrapeDev()], ["Lobsters", scrapeLobsters()],
    ["arXiv", scrapeArxiv()], ["Stack Overflow", scrapeStackOverflow()], ["InfoQ", scrapeInfoQ()], ["X", scrapeX()]
  ];
  const settled = await Promise.allSettled(tasks.map(([, task]) => task));
  const signals = settled.flatMap((result, index) => { if (result.status === "fulfilled") { console.log(`${tasks[index][0]}: ${result.value.length} signals`); return result.value; } console.warn(`${tasks[index][0]} failed:`, result.reason); return []; });
  if (!signals.length) throw new Error("All scraper sources failed; preserving the previous snapshot.");
  const ai = await enhanceWithAi(signals); const snapshot: Snapshot = { generatedAt: new Date().toISOString(), mode: ai ? "openai" : "deterministic", model: ai?.model, signals: ai?.signals ?? signals, summary: ai?.summary ?? summarize(signals) };
  await mkdir("public/data", { recursive: true }); await writeFile("public/data/snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Collected ${signals.length} signals (${snapshot.mode} analysis).`);
}
if (process.argv[1]?.includes("scrape")) main().catch(e => { console.error(e); process.exit(1); });
