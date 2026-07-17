# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Noni App — Project Context

## Stack
- Mobile: React Native with Expo (iOS + Android)
- Backend: Node.js / TypeScript (Express)
- Database: Supabase (managed PostgreSQL + built-in auth + real-time)
- Cache / Queue: Redis (Upstash)
- Payments: Flutterwave (primary — product decision 2026-07, replaces Paystack). Empty `FLW_SECRET_KEY` enables dev mode with a simulated checkout via `POST /v1/payments/dev/complete`.
- AI: Anthropic Claude API (claude-sonnet-4-6)
- Push notifications: Firebase Cloud Messaging (FCM)
- SMS / OTP: Termii (production), SMS Gate / sms-gate.app (dev-beta, via Android phone SIM), console log fallback — see `apps/api/src/services/sms.service.ts`
- Monorepo: Turborepo (npm workspaces, Node >= 20)

## Documentation
- docs/noni_prd.md — product requirements, user stories, non-functional requirements. This is the source of truth for WHAT to build and WHY.
- docs/noni_architecture.md — system architecture, data model, API design, tech stack rationale. This is the source of truth for HOW to build it.
- DESIGN.md — design system, color tokens, typography, motion, crisis UI protocol, and the four deliberate risk decisions. This is the source of truth for how Noni LOOKS and FEELS.
- docs/safeguarding-policy.md — safeguarding / crisis policy backing the S-001–S-007 requirements.
- Read all three core documents at the start of every session before writing any code or making any technical decisions.

## Commands

All root commands run through Turborepo across every workspace:

```bash
npm run dev          # turbo run dev (API: tsx watch; mobile apps: expo start)
npm run build        # turbo run build
npm run lint         # turbo run lint
npm run typecheck    # turbo run typecheck
npm run test         # turbo run test
npm run format       # prettier --write
```

Scope to a single workspace with `-w`:

```bash
npm run -w @noni/api dev                  # API dev server (tsx watch src/index.ts)
npm run -w @noni/api test                 # vitest run (API is the only app with tests)
npm run -w @noni/api test:watch           # vitest watch mode
npx -w @noni/api vitest run src/services/__tests__/safety.service.test.ts   # single test file
npm run -w @noni/mobile-user dev          # expo start (also: android / ios / web scripts)
npm run -w @noni/mobile-agent dev
```

Shipping app changes (`npm run ota` from the root): publishes an EAS Update to the
`preview` channel for both apps — installed builds pick it up on next launch, no
rebuild, no build credits. Works for any JS/TS change (screens, logic, copy, shared
packages). Only native changes (new native modules, permissions, app.json plugins,
icons/splash) need a real `eas build`. Commit first — the update message is taken
from the latest git commit (`--auto`).

Prisma (all scoped to `@noni/api`):

```bash
npm run -w @noni/api prisma:generate      # regenerate client (required after schema changes;
                                          # CI runs this before lint/typecheck/test)
npm run -w @noni/api prisma:migrate       # prisma migrate dev
npm run -w @noni/api prisma:studio
```

The API requires env vars validated by zod at startup (`apps/api/src/config/env.ts`) — it throws immediately if `DATABASE_URL`, `REDIS_URL`, JWT secrets, Paystack keys, or `ANTHROPIC_API_KEY` are missing. Copy `apps/api/.env.example` first.

## Monorepo layout

- `apps/api` — Express + Socket.IO backend (`@noni/api`). The only workspace with a build step (tsup) and tests (vitest).
- `apps/mobile-user` / `apps/mobile-agent` — two Expo apps (user-facing and agent-facing) with near-identical structure: `src/screens/`, `src/navigation/RootNavigator.tsx`, `src/stores/` (zustand), `src/api/client.ts`. State via zustand + TanStack Query; navigation via React Navigation.
- `packages/types` — shared TypeScript types (`@noni/types`).
- `packages/ai-prompt` — Claude system prompt + crisis keyword list and `detectCrisis()` (`@noni/ai-prompt`). Shared so backend and prompts stay in sync.
- `packages/api-client` — typed HTTP client used by both mobile apps.
- `packages/ui` — shared RN components and `theme.ts` (the code mirror of DESIGN.md), including crisis components (`CrisisAlert`, `CrisisScript`, `BlockReportSheet`, `Disclaimer`).
- `packages/config` — shared eslint/tsconfig.

Shared packages ship raw TypeScript (`main` points at `src/index.ts`) — no build step; consumers compile them directly. React / React Native versions are pinned via root `package.json` `overrides`.

## Backend architecture (apps/api)

- `src/index.ts` connects Redis + Prisma, then builds the Express app (`src/app.ts`) and the Socket.IO server (`src/realtime/index.ts`) on one HTTP server.
- Route modules under `src/routes/` mount at `/v1/*`; business logic lives in `src/services/` (auth, session, queue, agent, ai, payment, subscription, user, safety, sms, training, notification).
- **Webhook ordering constraint:** `paymentRouter` is mounted BEFORE `express.json()` in `app.ts` because the Flutterwave webhook needs the raw body (its non-webhook routes parse JSON locally). Don't reorder middleware there. Flutterwave webhooks are verified by comparing the `verif-hash` header to `FLW_WEBHOOK_HASH` — but the webhook is OPTIONAL and normally unset: the Flutterwave account is shared with another product, so Noni confirms top-ups webhook-independently via `verify_by_reference` (`POST /v1/payments/verify` on checkout return + a background poll in the sweeper). Crediting is idempotent, so both paths can coexist safely. OPay is offered as a dedicated checkout option (`paymentOption: 'opay'`).
- Realtime: Socket.IO with the Redis adapter (scales across instances), websocket transport only. Handshake is authenticated with the JWT access token; handlers split into `session.socket.ts` and `queue.socket.ts`. Services never import `io` — they publish room events through `realtime/publish.ts` (Redis channel `noni:room:<room>`), which `realtime/index.ts` relays into Socket.IO on every instance. Sockets auto-join a `user:<id>` personal room (agents get `session_assigned` offers there) and admins join `admins`.
- Queue engine (`queue.service.ts`): Redis zset `queue:waiting`; priority entries get a large score offset so they sort first (F-008). Matching offers a session to one agent at a time with a 60s accept window (F-032); a 15s sweeper in `index.ts` handles offer timeouts, stale-queue refunds (F-029), session overruns, and subscription renewals.
- Auth: phone-number based (numbers are salted-hashed to `phoneHash`; raw numbers are never stored), OTP via Termii, JWT access + refresh tokens.
- Errors: throw typed errors from `src/utils/errors.ts`; `asyncHandler` + the error middleware handle the rest.

## Safety / crisis protocol

`src/services/safety.service.ts` implements PRD S-001–S-007. **Every text message — user, agent, or AI — must pass through it before being forwarded.** Crisis keywords and the response script live in `@noni/ai-prompt`. A trigger writes a `CrisisIncident` audit row (never message content), flags the session, and broadcasts via Redis pub/sub to the socket room. Session message content is NEVER persisted to the database — this is a hard privacy rule stated at the top of `schema.prisma`, with exactly one audited exception: `AgentReport.evidenceEncrypted` (S-005) holds a chat excerpt the REPORTER explicitly opted to attach when reporting misconduct — AES-256-GCM encrypted, never logged, admin-readable only via `GET /v1/admin/reports/:id/evidence`, and purged when the report is resolved. Do not add other persistence paths for message content.

## Design System
Always read DESIGN.md before making any visual or UI decision. All color tokens, typography choices, spacing, and aesthetic direction are defined there. `packages/ui/src/theme.ts` is the code mirror — both must stay in sync. Do not deviate without explicit user approval. Core non-negotiables:
- No mascot, no cartoon character, no illustrated friend. The user is the subject.
- Warm-dark foundation only. Three-accent system, one role each: **Plum `#8E6B8E`** (primary — CTAs, toasts, active states), **Indigo `#6B7B9B`** (secondary — links, nav), **Rose `#D48A8A`** (emphasis — italic emotional accent on display copy). Never mix roles. Never substitute saturated violet, royal blue, or hot pink.
- Fraunces display + General Sans body + Geist for numbers. Do not introduce Inter, Roboto, Poppins, or system defaults.
- Crisis UI is held, not alarmed. Muted red (#C75450), never panic red.
- Preview artifact: `~/.gstack/projects/noni/designs/preview.html`.

## Key constraints
- All prices, wallet amounts, and earnings stored in kobo as `Int` (₦1 = 100 kobo)
- Nigerian users: support USSD, OPay, PalmPay via Paystack
- Crisis protocol (S-001 through S-007 in PRD) must be implemented before any user can interact with the platform
- NDPC compliance required — see PRD section 6 (NF-013, NF-014)
- API uses ESM (`"type": "module"`) — local imports need explicit `.js` extensions
