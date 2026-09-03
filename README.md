# DevSignal

[![CI and deploy](https://github.com/OsamaAnsar/devsignal/actions/workflows/ci.yml/badge.svg)](https://github.com/OsamaAnsar/devsignal/actions/workflows/ci.yml)

An AI-powered technology intelligence dashboard. A TypeScript scraper collects Hacker News and GitHub Trending, normalizes the results, enriches them with topics and sentiment, and renders the daily signal as an interactive React dashboard.

## Why this exists

Trend pages give you ranked links, not understanding. DevSignal demonstrates the complete web-intelligence pipeline: resilient multi-source extraction, typed normalization, explainable offline analysis, optional LLM enrichment, scheduled refresh, and a visualization layer that makes the result useful.

## Pipeline

```text
Hacker News HTML ─┐
                  ├─ Cheerio extraction → normalized signals → AI/rule analysis → JSON snapshot → React charts
GitHub Trending ──┘
```

- **Real scraper:** `scripts/scrape.ts` fetches and parses both public pages with source-specific selectors. One source can fail without losing the other.
- **AI enrichment:** when `OPENAI_API_KEY` exists, OpenAI assigns semantic topics, sentiment, and briefing insights. Without it, deterministic rules provide a transparent zero-cost demo.
- **Interactive visualization:** filterable topic momentum, sentiment, language, and ranked-signal views built with Recharts.
- **Automation:** GitHub Actions refreshes data daily, tests and builds the app, then deploys it to GitHub Pages.
- **Responsible collection:** only public pages are read, at most once per source per daily run, with an identifying user agent. No personal data or authenticated pages.

## Run locally

```bash
npm install
npm run scrape   # optional; refreshes public/data/snapshot.json
npm run dev
```

Add `OPENAI_API_KEY` to your environment for LLM enrichment. It is never exposed to the browser.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## Stack

TypeScript, React, Vite, Node.js Fetch, Cheerio, OpenAI Responses API, Zod, Recharts, Vitest, GitHub Actions, GitHub Pages.
