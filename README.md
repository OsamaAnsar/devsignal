# DevSignal

[![CI and deploy](https://github.com/OsamaAnsar/devsignal/actions/workflows/ci.yml/badge.svg)](https://github.com/OsamaAnsar/devsignal/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/live-demo-1748d1)](https://osamaansar.github.io/devsignal/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)

**A quieter way to read the developer internet.**

DevSignal collects Hacker News and GitHub Trending, turns the results into typed technology signals, and presents the daily picture through an editorial React dashboard. It supports both scheduled OpenAI enrichment and free, private AI inference in the browser.

**[Open the live dashboard →](https://osamaansar.github.io/devsignal/)**

## What it does

- Scrapes up to 20 public items from Hacker News and 20 repositories from GitHub Trending.
- Normalizes titles, descriptions, source scores, languages, topics, and sentiment into one JSON snapshot.
- Visualizes topic momentum, sentiment distribution, trending languages, and the highest-momentum signals.
- Lets visitors search and filter the daily index.
- Runs a quantized DistilBERT model locally through Transformers.js when **Run free local AI** is selected.
- Recalculates sentiment, confidence scores, per-item AI takes, the briefing, and the **AI Signal Pulse** on-device.
- Creates a shareable daily brief with the Web Share API or clipboard fallback.
- Optionally uses the OpenAI Responses API during the scheduled data pipeline for richer server-side analysis.
- Refreshes and deploys automatically with GitHub Actions and GitHub Pages.

## Two AI modes

| Mode | Where it runs | Key required | What it produces |
| --- | --- | --- | --- |
| Local AI | Visitor's browser | No | Sentiment, confidence, AI takes, and a reactive signal pulse |
| OpenAI | GitHub Actions | `OPENAI_API_KEY` | Semantic topics, sentiment, AI takes, confidence, and three briefing insights |
| Rules fallback | Data pipeline | No | Transparent keyword topics, sentiment, and summary statistics |

The local model is downloaded on first use and cached by the browser. Headlines stay on the visitor's device during local inference.

## Architecture

```text
Hacker News ─────┐
                 ├─ TypeScript + Cheerio scraper ─→ normalized signals
GitHub Trending ─┘                                  │
                                                    ├─ OpenAI (optional, Actions secret)
                                                    └─ deterministic fallback
                                                               │
                                                               ▼
                                                     public JSON snapshot
                                                               │
                                                               ▼
                                              React + Recharts dashboard
                                                               │
                                                               └─ DistilBERT in browser (optional)
```

The scraper tolerates one source failing, but preserves the previous snapshot if every source fails. Public pages are fetched once per scheduled run with an identifying user agent; no authenticated pages or personal data are collected.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run scrape
npm run dev
```

The project works without any API credentials. Open the local site and select **Run free local AI** to test browser inference.

### Optional OpenAI enrichment

Set `OPENAI_API_KEY` in your local environment before running the scraper:

```bash
OPENAI_API_KEY="your-key" npm run scrape
```

For GitHub Pages, create an Actions repository secret named `OPENAI_API_KEY`. The key is read only by the Actions runner and is never included in the client bundle or published snapshot. If the key is missing or inference fails, DevSignal automatically uses its deterministic fallback.

## Commands

```bash
npm run dev        # start the Vite development server
npm run scrape     # refresh public/data/snapshot.json
npm test           # run scraper and analysis tests
npm run typecheck  # verify TypeScript
npm run build      # create the production build
```

## Technology

- React 19, TypeScript, and Vite
- Node.js Fetch and Cheerio
- Transformers.js and quantized DistilBERT
- OpenAI Responses API with Structured Outputs
- Recharts and Lucide icons
- Vitest
- GitHub Actions and GitHub Pages

## Data and security

- Only public Hacker News and GitHub Trending pages are scraped.
- The OpenAI key belongs in an environment variable or GitHub Actions secret—never in source code.
- Local AI inference sends no analyzed headline or description to OpenAI.
- Every dashboard item links back to its original source.

## License

This repository is provided as a portfolio and learning project. Review the source websites' terms before adapting the scraper for higher-frequency or commercial collection.
