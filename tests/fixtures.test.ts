import { describe, expect, it } from "vitest"; import { parseGitHubTrending, parseHackerNews } from "../scripts/scrape";
describe("scrapers",()=>{
  it("parses Hacker News rows",()=>{const html='<table><tr class="athing" id="9"><td class="title"><span class="titleline"><a href="https://x.dev">AI agents arrive</a></span></td></tr><tr><td><span class="score">123 points</span></td></tr></table>';expect(parseHackerNews(html)[0]).toMatchObject({id:"hn-9",score:123,topic:"AI & Agents"})});
  it("parses GitHub Trending cards",()=>{const html='<article class="Box-row"><h2><a href="/acme/tool">acme/tool</a></h2><p>Fast TypeScript SDK</p><span itemprop="programmingLanguage">TypeScript</span><a href="/acme/tool/stargazers">1,234</a></article>';expect(parseGitHubTrending(html)[0]).toMatchObject({score:1234,language:"TypeScript",topic:"Developer Tools"})});
});
