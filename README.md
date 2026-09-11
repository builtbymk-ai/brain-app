# BRAIN — Business Revenue Assessment & Intelligence Node

> Research the business, uncover the problems, assess the opportunities, and implement the solutions.

BRAIN is a full-stack business research and intelligence platform that transforms scattered publicly available business information into structured intelligence. It identifies potential problems, opportunities, and next actions for e-commerce businesses.

---

## What BRAIN Does

1. **Research** — Collects publicly available signals from multiple sources (web presence, products, reviews, social media, search visibility)
2. **Analyze** — Runs a deterministic ACR (Acquisition–Conversion–Retention) Revenue Opportunity Calculator against collected evidence
3. **Interpret** — Uses AI (Gemini, OpenRouter) or a deterministic fallback to produce actionable intelligence reports
4. **Export** — Delivers structured CSV/JSON exports for $1.50 via Bachs

---

## Target Users

- Business owners and operators
- Freelancers and agencies
- Lead generators
- Consultants
- Researchers
- E-commerce professionals

---

## Research Modes

### Owner Mode
For business owners assessing their own operations. Input brand details, marketing status, and goals. BRAIN returns a diagnosis with priority changes and solution impact.

### Prospect Mode
For freelancers/agencies evaluating a potential client. Input a proposed solution alongside the business. BRAIN assesses fit, provides an angle of pitch, and flags insufficient evidence.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| Styling | Tailwind CSS |
| AI (Primary) | Gemini 3.5 Flash |
| AI (Fallback) | Gemini 3.6 Flash |
| AI (Secondary) | OpenRouter — Ling 3.0 Flash Fin, Inkling |
| Web Scraping | Firecrawl, Apify |
| Search | SerpAPI |
| Business Data | Apollo.io |
| Payments | Bachs.io (hosted checkout) |
| Storage | Cloudflare R2 |
| Analytics | Google (Custom Search API) |

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── research/route.ts       # Research pipeline endpoint
│   │   ├── export/create/route.ts  # Create export (Bachs checkout session)
│   │   ├── export/verify/route.ts  # Verify payment & serve export
│   │   ├── github/route.ts         # GitHub API integration
│   │   └── bachs/webhook/route.ts  # Bachs webhook (source of truth)
│   ├── research/
│   │   ├── page.tsx                # Mode chooser
│   │   ├── owner/page.tsx          # Owner research workspace
│   │   └── prospect/page.tsx       # Prospect research workspace
│   ├── layout.tsx
│   ├── page.tsx                    # Landing page
│   └── globals.css
├── components/
│   ├── LandingNav.tsx
│   └── ResearchWorkspace.tsx
├── db/
│   ├── client.ts                   # Drizzle DB client
│   └── schema.ts                   # Database schema
└── lib/
    ├── analysis/
    │   ├── benchmark.txt           # Benchmark reference library
    │   ├── benchmarks.ts           # Benchmark parser
    │   ├── calculator.ts           # ACR Revenue Opportunity Calculator
    │   ├── gemini.ts               # Gemini analysis layer + fallback chain
    │   ├── openrouter.ts           # OpenRouter provider
    │   ├── modes.ts                # Owner/Prospect mode definitions
    │   ├── model-rules.txt         # MAPS-aligned analysis rules
    │   └── types.ts                # Analysis types
    ├── research/
    │   ├── engine.ts               # Research orchestration
    │   ├── firecrawl.ts            # Web content extraction
    │   ├── apify.ts                # Social media scraping
    │   ├── apollo.ts               # Business data lookup
    │   ├── serpapi.ts              # Search visibility & traffic
    │   ├── signals.ts              # Signal aggregation
    │   └── types.ts                # Research types
    ├── export/serialize.ts         # CSV/JSON export serializer
    ├── paywall.ts                  # Server-side premium paywall
    ├── bachs.ts                     # Bachs payment provider client
    ├── github.ts                   # GitHub API client
    ├── env.ts                      # Environment variable access
    ├── id.ts                       # ID generation
    └── r2.ts                       # Cloudflare R2 storage
```

---

## AI Analysis Chain

BRAIN uses a 5-tier analysis chain with automatic fallback:

1. **Gemini 3.5 Flash** (primary) — `analysisSource: gemini-3.5-flash`
2. **Gemini 3.6 Flash** (fallback) — `analysisSource: gemini-3.6-flash`
3. **OpenRouter Ling 3.0 Flash Fin** — `analysisSource: openrouter/inclusionai/ling-3.0-flash-fin:free`
4. **OpenRouter Inkling** — `analysisSource: openrouter/thinkingmachines/inkling:free`
5. **Deterministic fallback** — `analysisSource: deterministic`

The deterministic ACR calculator is always authoritative. AI models interpret calculator output — they never perform revenue arithmetic.

---

## ACR Revenue Opportunity Model

The Acquisition–Conversion–Retention (ACR) calculator is deterministic and produces:

- Baseline buyers and revenue
- Conversion opportunities (e.g., quiz/lifecycle tools)
- Retention opportunities (e.g., LTV systems)
- Risk-adjusted revenue opportunity
- Growth assessment

Evidence labels track data provenance:
- **[OBS]** — Observed directly from the business
- **[BMK]** — External benchmark
- **[ASM]** — Explicit assumption
- **[DRV]** — Derived/calculated value

Revenue estimates are always presented as directional opportunity, never guaranteed results.

---

## Premium Paywall

| Tier | Access |
|---|---|
| Free | Revenue Opportunity + Growth Assessment for all rows; Solution Impact + Priority Changes (or Angle of Pitch) for first 2 rows only |
| Paid ($1.50) | Full premium intelligence for all rows + CSV/JSON export |

The paywall is enforced server-side. Premium fields are stripped from API responses before they reach the client.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `BACHS_API_KEY` | Bachs secret key (server-side checkout + verification) |
| `BACHS_BASE_URL` | Bachs API base URL (`https://sandbox-api.bachs.io` sandbox, `https://api.bachs.io` production) |
| `GOOGLE_API_KEY` | Google Custom Search API key |
| `FIRECRAWL_API_KEY` | Firecrawl API key (web content extraction) |
| `APIFY_TOKEN` | Apify token (social media scraping) |
| `SERPAPI_KEY` | SerpAPI key (search visibility) |
| `APOLLO_API_KEY` | Apollo.io API key (business data) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 access key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret key |

### Optional

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (secondary AI fallback) |
| `OPENROUTER_PRIMARY_MODEL` | OpenRouter primary model ID |
| `OPENROUTER_FALLBACK_MODEL` | OpenRouter fallback model ID |
| `GITHUB_TOKEN` | GitHub personal access token (repo integration) |
| `BACHS_WEBHOOK_SECRET` | Bachs webhook HMAC-SHA256 signature secret |
| `BACHS_WEBHOOK_TOLERANCE` | Bachs webhook replay tolerance in seconds (default 300) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API keys for the services listed above

### Install

```bash
npm install
# or
bun install
```

### Database Setup

```bash
npx drizzle-kit push
```

### Development

```bash
npm run dev
# or
bun run dev
```

The app runs on `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/research` | POST | Run research pipeline for one or more businesses |
| `/api/export/create` | POST | Initialize export + Bachs checkout session |
| `/api/export/verify` | POST | Verify payment (via Bachs) and unlock export |
| `/api/bachs/webhook` | POST | Bachs webhook (HMAC-SHA256 signature-verified, source of truth) |
| `/api/github` | GET | GitHub connection status, repos, branches, commits |
| `/api/github` | POST | Create GitHub repository |

---

## Database Schema

- **research_sessions** — Stores research session metadata, inputs, results, and entitlement status
- **research_rows** — Individual business research results with analysis data
- **export_records** — Export payment status and file references

---

## Testing

```bash
# TypeScript check
bun run typecheck

# Calculator tests (66 tests)
bun scripts/test-calculator.ts

# Export tests (21 tests)
bun scripts/test-export.ts

# Validation suite (24 tests)
bun run validate

# Paywall tests
bun scripts/test-paywall.ts

# Webhook tests
bun scripts/test-webhook.ts
```

---

## Key Design Decisions

- **Calculator is authoritative** — AI models interpret, never recalculate
- **Server-side paywall** — Premium data never reaches the client for unpaid users
- **Evidence labels** — Every quantitative input is traceable to its source
- **Mode separation** — Owner and Prospect outputs have distinct schemas
- **Deterministic fallback** — If all AI providers fail, the system still produces honest, evidence-tagged output
- **No fabricated traffic** — Missing or unreliable traffic data returns "not found" rather than estimates

---

## License

Proprietary — All rights reserved.

---

## Contact

Built by [builtbymk-ai](https://github.com/builtbymk-ai)
