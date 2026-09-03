# DevSignal

[![CI and deploy](https://github.com/OsamaAnsar/devsignal/actions/workflows/ci.yml/badge.svg)](https://github.com/OsamaAnsar/devsignal/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/live-demo-1748d1)](https://osamaansar.github.io/devsignal/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)

**A quieter way to read the developer internet.**

DevSignal collects Hacker News, GitHub Trending, npm, DEV Community, Lobsters, arXiv, Stack Overflow, InfoQ, YouTube developer channels, and optional Reddit/X feeds; turns the results into typed technology signals; and presents the daily picture through an editorial React dashboard. It supports both scheduled OpenAI enrichment and free, private AI inference in the browser.

**[Open the live dashboard →](https://osamaansar.github.io/devsignal/)**

## What it does

- Collects public signals from Hacker News, GitHub Trending, npm Registry, DEV Community, Lobsters, arXiv, Stack Overflow, InfoQ, and curated YouTube channel feeds without credentials.
- Shows video thumbnails and direct watch links. An optional YouTube API key replaces the curated feed with fresh developer-video search and view counts.
- Supports Reddit through its OAuth Data API and X through its recent-search API when their optional credentials are configured.
- Normalizes titles, descriptions, source scores, languages, topics, and sentiment into one JSON snapshot.
- Visualizes topic momentum, sentiment distribution, trending languages, and the highest-momentum signals.
- Connects related items across sources into evidence-backed technology clusters.
- Maps clusters on an interactive radar using cross-source reach and normalized momentum.
- Stores up to 90 daily observations so real rising and cooling trends can emerge over time.
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
HN · GitHub · npm ─────────┐
DEV · Lobsters · InfoQ ────┼─ TypeScript collectors ─→ normalized signals
YouTube feeds / API ───────┤
arXiv · Stack Overflow ────┤                          │
Reddit · X* ───────────────┘                          │
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

### Optional Reddit and X sources

Reddit requires `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`. X requires `X_BEARER_TOKEN`. Add these as GitHub Actions secrets to activate the corresponding collectors. Missing credentials simply skip those sources; they never break the remaining daily scrape.

### Optional YouTube API search

YouTube works without credentials by reading the public feeds for selected developer channels. To expand it to recent developer-video search with view counts, enable the YouTube Data API in Google Cloud and add its key as a GitHub Actions secret named `YOUTUBE_API_KEY`. The key is used only during the scheduled scrape and is never published to the browser.

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

- Only public pages and documented APIs are used. Credential-gated Reddit and X collectors are disabled by default.
- The OpenAI key belongs in an environment variable or GitHub Actions secret—never in source code.
- Local AI inference sends no analyzed headline or description to OpenAI.
- Every dashboard item links back to its original source.

## License

This repository is provided as a portfolio and learning project. Review the source websites' terms before adapting the scraper for higher-frequency or commercial collection.
