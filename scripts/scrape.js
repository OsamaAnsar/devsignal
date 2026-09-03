import * as cheerio from "cheerio";
import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import { makeSignal, summarize } from "../src/lib/analyze";
const headers = { "User-Agent": "DevSignal/1.0 (+https://github.com/OsamaAnsar/devsignal)" };
async function html(url) { const r = await fetch(url, { headers }); if (!r.ok)
    throw new Error(`${url}: ${r.status}`); return r.text(); }
export function parseHackerNews(body) {
    const $ = cheerio.load(body);
    const rows = $("tr.athing").toArray();
    return rows.slice(0, 20).map((row) => {
        const link = $(row).find(".titleline > a").first();
        const id = $(row).attr("id") ?? link.text();
        const scoreText = $(row).next().find(".score").text();
        return makeSignal({ id: `hn-${id}`, title: link.text().trim(), url: link.attr("href") ?? "https://news.ycombinator.com", source: "Hacker News", score: Number(scoreText.match(/\d+/)?.[0] ?? 0) });
    });
}
export function parseGitHubTrending(body) {
    const $ = cheerio.load(body);
    return $("article.Box-row").toArray().slice(0, 20).map((row, index) => {
        const path = $(row).find("h2 a").attr("href")?.trim() ?? "";
        const title = path.replace(/^\//, "").replace("/", " / ");
        const stars = $(row).find('a[href$="/stargazers"]').text().replace(/,/g, "").trim();
        return makeSignal({ id: `gh-${index}-${path}`, title, url: `https://github.com${path}`, source: "GitHub Trending", score: Number(stars) || 0, language: $(row).find('[itemprop="programmingLanguage"]').text().trim() || undefined, description: $(row).find("p").text().replace(/\s+/g, " ").trim() });
    });
}
async function enhanceWithAi(signals) {
    if (!process.env.OPENAI_API_KEY)
        return null;
    const client = new OpenAI();
    const response = await client.responses.create({ model: "gpt-4.1-mini", input: `Analyze these technology signals. Return JSON with keys items (array of {id,topic,sentiment}) and summary (exactly 3 concise insights). Sentiment must be positive, neutral, or negative.\n${JSON.stringify(signals)}` });
    try {
        const parsed = JSON.parse(response.output_text.replace(/^```json\s*|\s*```$/g, ""));
        const byId = new Map(parsed.items.map((x) => [x.id, x]));
        return { signals: signals.map(s => ({ ...s, ...(byId.get(s.id) ?? {}) })), summary: parsed.summary };
    }
    catch {
        return null;
    }
}
async function main() {
    const settled = await Promise.allSettled([html("https://news.ycombinator.com/"), html("https://github.com/trending?since=daily")]);
    const signals = [settled[0].status === "fulfilled" ? parseHackerNews(settled[0].value) : [], settled[1].status === "fulfilled" ? parseGitHubTrending(settled[1].value) : []].flat();
    if (!signals.length)
        throw new Error("All scraper sources failed; preserving the previous snapshot.");
    const ai = await enhanceWithAi(signals);
    const snapshot = { generatedAt: new Date().toISOString(), mode: ai ? "openai" : "deterministic", signals: ai?.signals ?? signals, summary: ai?.summary ?? summarize(signals) };
    await mkdir("public/data", { recursive: true });
    await writeFile("public/data/snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`Collected ${signals.length} signals (${snapshot.mode} analysis).`);
}
if (process.argv[1]?.includes("scrape"))
    main().catch(e => { console.error(e); process.exit(1); });
