# Enterprise Search Slack Bot — Technical Guide

Version: 1.0
Date: 2025-08-14

## Overview
The Enterprise Search Slack Bot enables users to search, discover, and interact with enterprise content directly from Slack. It integrates with a FastAPI backend and renders rich, interactive Slack messages using Block Kit.

This guide covers capabilities, end-to-end flow, intents, roles, authentication, middleware usage, endpoints, formatting, and troubleshooting.

---

## Capabilities (What it can do)
- **Search documents** via FastAPI (`POST /api/search`) and display results with title, preview, platform, and score. See `src/utils/formatter.js#formatSearchResults()`.
- **Suggested documents** tailored by user and company context (`POST /api/suggested-documents`). See `formatSuggestedDocuments()`.
- **Trending documents** to surface frequently viewed/searched content (`POST /api/trending-documents`). Interactive actions: Why this?, Search similar, Show more. See `formatTrendingDocuments()`.
- **Company context selection** per Slack user and channel using `SlackSessionModel` (`src/models/SlackSession.js`).
- **Admin tool requests redirection** (connect/disconnect/status) to Enterprise Search console. See `buildEsRedirectBlocks()` in `app.js`.
- **General small talk** intent for basic greetings and help (no auth required). See `src/services/nlpService.js`.

---

## High-level Architecture & Flow
1. **Slack Event**: User mentions the bot in a channel or sends a DM. Handlers in `app.js` (`app.event('app_mention')` and `app.message`).
2. **Pre-checks**:
   - Auto-join channel if needed.
   - Quick NLP check for general intents (greetings/help) via `nlpService.parseQuery()`.
   - Intercept admin-tool intents (connect/disconnect/status) and redirect to ES console.
3. **Authentication & Context**:
   - Extract Slack user email using `users.info`.
   - `requireUserAuthentication` middleware validates access; prompts company selection if missing and persists it in `SlackSessionModel`.
   - Build `userContext` with `slackUserId`, `slackEmail`, and `companyId` (if selected).
4. **Intent Processing**:
   - `queryHandler.processQuery()` parses the query using the unified intent engine and dispatches actions (e.g., search, suggested, trending).
5. **API Calls**:
   - `apiService.callAPI()` constructs POST bodies, whitelists endpoint parameters, and always embeds `company_id` and `user_email` for secured endpoints.
   - Endpoints configured in `src/config/apis.js`.
6. **Formatting & Response**:
   - `formatResponse()` delegates to per-feature formatters in `src/utils/formatter.js` to produce Slack Block Kit.
   - For interactive flows, additional `app.action(...)` handlers manage button clicks (e.g., trending pagination).

---

## Intents (Tourist Guide)
Implemented via `src/services/nlpService.js` and handled in `src/handlers/queryHandler.js`.

- **general**: Simple greetings, help messages. No authentication. Returns conversational text.
- **callSearchApi** / `search`: Sends `POST /api/search` with `{ query, limit?, company_id, user_email }`. Blocks: header, timing, top results, and metadata.
- **getSuggestedDocuments**: Sends `POST /api/suggested-documents` with RBAC-only `{ company_id, user_email }`. Blocks show suggested items with preview, platform, file type, score, suggestion reason.
- **getTrendingDocuments**: Sends `POST /api/trending-documents` with RBAC-only `{ company_id, user_email }`. Blocks show interactive items (Open, Why this?, Search similar) and a Show more pagination control.
- **getSearchAnalytics / fetch recent searches** (if enabled): Routed to analytics endpoints per `apis.js`. Ensure endpoint availability; otherwise returns 404 from backend.

Note: Additional admin-tool-esque phrases are intercepted and redirected rather than executed inside Slack.

---

## Roles & Permissions
- **User**: Can run searches and view suggestions/trending within selected company context.
- **Admin**: Manages connectors/tools in the Enterprise Search web console. The bot does not execute admin connector actions in Slack; it redirects.

Role awareness for company selection dialog (owner/user labels) is based on data saved in `SlackSessionModel` after auth.

---

## Authentication & Company Context
- **Email Extraction**: From Slack profile via `users.info`. Fallback from `RBAC_CONFIG` if missing. See `app.js` lines around email extraction.
- **Middleware**: `src/middleware/authenticateUser.js` (`requireUserAuthentication`) verifies the user and ensures a company is selected. If not, it prompts a company picker and stores selection in `SlackSessionModel`.
- **Company Context**: Persisted per `slackUserId + channelId`. Included as `company_id` in every secured API request.

Skips middleware: The bot short-circuits for the `general` intent (greetings/help) and replies without invoking secured endpoints.

---

## API Endpoints
Configured in `src/config/apis.js`. Base URL from `FASTAPI_BACKEND_URL` (host only; no `/api` suffix).

- `POST /api/search` — Body: `{ query, limit?, company_id, user_email }`
- `POST /api/suggested-documents` — Body: `{ company_id, user_email }`
- `POST /api/trending-documents` — Body: `{ company_id, user_email }`
- (Optional) analytics endpoints if available

`apiService.callAPI()` whitelists allowed parameters per endpoint, adds RBAC fields, validates presence, and coerces `company_id` to string.

---

## Slack Message Formatting
All Slack UX rendering is in `src/utils/formatter.js`.

- **Search**: `formatSearchResults(data)`
  - Header with result count and response time.
  - Up to 5 results: title, preview, Open button, platform, score.

- **Suggested**: `formatSuggestedDocuments(data)`
  - Header with count and optional suggestion reason.
  - Items with title, preview, Open button, platform, file type, score, item-level reason.

- **Trending**: `formatTrendingDocuments(data)`
  - Supports shapes `{ data, total }` or `{ trending_documents, total_trending }`.
  - Items with title, preview, Open button, context line.
  - Interactive actions: Why this?, Search similar.
  - Pagination: Show more button with offset; handlers in `app.js` (`trending_why_*`, `trending_similar_*`, `trending_show_more`).
  - Defensive checks to avoid `invalid_blocks` (URL validation, preview truncation, no `action_id` on URL buttons).

---

## Configuration & Environment
- `FASTAPI_BACKEND_URL` — Base backend URL (no `/api`).
- `DEFAULT_COMPANY_ID` — Fallback company context if the user hasn’t selected one.
- Slack tokens/secrets: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, (optionally `SLACK_APP_TOKEN` for Socket Mode).
- Optional: `ES_DASHBOARD_URL` for redirection buttons.

---

## Key Files & Responsibilities
- `app.js`
  - Slack event handling (mentions and DMs), auth, company selection, redirection of admin-tool intents, action handlers for trending interactivity.
- `src/handlers/queryHandler.js`
  - Unified intent engine dispatch, calling `apiService` with `slackUserId`, `slackEmail`, `companyId`.
- `src/services/apiService.js`
  - Axios client, endpoint param whitelisting, RBAC fields, and error handling.
- `src/utils/formatter.js`
  - Slack Block Kit rendering for search, suggested, trending.
- `src/middleware/authenticateUser.js`
  - Company selection and user verification.
- `src/models/SlackSession.js`
  - Mongo model storing `slackUserId`, `channelId`, `companyId`, `role`.

---

## Troubleshooting
- **422 Unprocessable Entity**: Ensure only whitelisted body params are sent and `company_id`, `user_email` are present.
- **404 Not Found**: Confirm correct `/api/*` endpoints and `FASTAPI_BACKEND_URL` doesn’t include `/api`.
- **invalid_blocks**: Remove placeholder URLs, avoid `action_id` with `url` buttons, truncate previews.
- **Port conflicts**: Change `PORT` env or free port 3000.

---

## Future Enhancements
- Add full-text inline document previews when permitted by platform.
- Implement “Search similar” server-side action.
- Add slash commands (`/search`, `/suggested`, `/trending`).
- Role-based feature gating within Slack.

---

## Appendix: Example Payloads
- Search result structure: see `formatSearchResults()` references.
- Suggested response shape: `{ suggested_documents, total_suggestions, suggestion_reason }`.
- Trending response shape: `{ data, total }` (or `{ trending_documents, total_trending }`).

---

© Kroolo — Enterprise Search Slack Interface
