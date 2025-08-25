# KROOLO AI — Slack Bot Report

Version: 1.0
Date: 2025-08-14

## Executive Summary
KROOLO AI’s Slack Bot brings enterprise knowledge to where your teams already work. Employees can ask questions, find documents, and discover what’s trending without leaving Slack. The bot is secure, context-aware (company and user), and designed for fast adoption with minimal training.

---

## What the Bot Does
- **Ask & Find**: Ask natural language questions to discover relevant documents and answers.
- **Suggested for You**: See documents recommended based on your role and activity.
- **What’s Trending**: Explore documents that are popular across your company right now.
- **Quick Actions**:
  - Open the document directly.
  - See “Why this?” to understand relevance.
  - “Search similar” to find related content.
  - “Show more” to browse additional results.
- **Company Context**: Works within your selected company/workspace to keep results relevant.

---

## Who It’s For
- **All employees**: Search and discover content quickly.
- **Managers and Leads**: Track what’s trending and amplify key content.
- **Admins**: Manage connectors and data sources in the web console (outside Slack).

---

## How It Works (At a Glance)
1. You @mention the bot in a channel or DM.
2. The bot understands your request (search, suggest, trending, or help).
3. If needed, it asks you to pick your company/workspace once.
4. It returns rich, interactive results that you can act on immediately.

---

## User Journeys
- **Find a policy**
  - “@Bot show me the leave policy” → See top results → Open the doc.
- **Discover related content**
  - Click “Search similar” under a result to find more like it.
- **Understand recommendations**
  - Click “Why this?” to see why a document was suggested or trending.
- **Browse more**
  - Use “Show more” to see additional results without re-asking.

---

## Key Benefits
- **In-Slack Productivity**: No context switching to another app.
- **Faster Decisions**: Get the right document in seconds.
- **Explainability**: “Why this?” builds trust in recommendations.
- **Discoverability**: Trending content surfaces what matters to more people.

---

## Security & Privacy (High-Level)
- **Company-Scoped Results**: Results honor your company/workspace.
- **User Context**: Responses are tailored to the requesting user.
- **No Public Leaks**: The bot does not share results across companies.
- **Admin Controls**: Connectors and permissions are managed in the web console.

---

## Roles & Responsibilities
- **Employee**: Ask, browse, and open documents inside Slack.
- **Manager**: Promote or share key documents highlighted by Trending.
- **Admin**: Configure sources and access in the Enterprise Search console.

---

## Getting Started
1. Add the Slack Bot to your workspace and channel.
2. @mention the bot and send a question (e.g., “latest Q3 roadmap?”).
3. If prompted, pick your company/workspace once.
4. Use buttons to explore: Open, Why this?, Search similar, Show more.

---

## Frequently Asked Questions
- **Do I need training?** No. Ask in plain English.
- **Can I use it in any channel?** Yes, where the bot is added.
- **Is it secure?** Yes. Results are company-scoped and user-aware.
- **Where do I manage connectors?** In the Enterprise Search web console.

---

## What’s Included in This Release
- Search with rich results
- Suggested for You
- What’s Trending with interactive actions
- Company context selection and persistence

---

## Trending Documents (What to Expect)
- Shows popular content right now within your company/workspace.
- Every item includes title, short preview, and a quick “Open” button.
- Actions under each item:
  - Why this? — Brief reason the item is trending or relevant to you.
  - Search similar — Explore more documents like this one.
  - Show more — View additional trending items without re-asking.

Notes:
- If a document has no preview, you’ll still see the title and actions.
- Links only appear when a safe, valid URL is available.

---

## Overall Flow (Simple Walkthrough)
1) You @mention the bot in a channel or DM and ask for search, suggestions, or trending.
2) If it’s your first time in that channel, the bot may ask you to pick your company/workspace once.
3) The bot returns clean, interactive results with buttons (Open, Why this?, Search similar, Show more).
4) You keep browsing within Slack; no need to switch apps.

---

## Authentication & Middleware (When It Applies)
- The bot tailors results to your company and your Slack user.
- It may ask you to confirm/select your company once per channel. Your choice is remembered.

Applied:
- When you request search, suggested, or trending content, the bot uses your selected company and your Slack identity to fetch the right results.

Skipped:
- For general chit‑chat (e.g., greetings/help), the bot responds right away without any company selection prompt.

What it means for you:
- You get relevant results for your company.
- You won’t see content from other companies or workspaces.

---

## Admin Actions in Slack (Connect, Disconnect, Ingest)
- If you try to perform administrative actions (e.g., connect a new tool, disconnect a source, ingest data) via Slack, the bot will guide you to the Enterprise Search web console.
- Rationale: Admin actions are performed in the console where you have full controls, confirmation steps, and visibility.
- In Slack, you’ll see a helpful button to open the Enterprise Search console and complete the action securely there.

Examples:
- “Connect Google Drive” → Slack shows a button to open the console’s connectors page.
- “Disconnect Confluence” → Slack redirects you to the console with context.
- “Ingest HR documents” → Slack points you to the ingestion flow in the console.

---

## Roadmap (Highlights)
- “Search similar” as a one-click action
- Slash commands (e.g., /search)
- Expanded analytics dashboards

---

## Contact
For support or enablement, contact your KROOLO AI admin or the Enterprise Search team.

© KROOLO AI — All rights reserved
