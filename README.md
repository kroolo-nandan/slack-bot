# 🤖 Enterprise Search Slack Bot

An intelligent Slack bot that provides enterprise-wide search capabilities with AI-powered natural language processing and dynamic user authentication via Pipedream.

## ✨ Features

- 🔍 **Enterprise Search**: Search across Google Drive, Slack, Dropbox, Jira, Zendesk, and Document360
- 🧠 **AI-Powered NLP**: Uses OpenAI GPT and Google Gemini for natural language query processing
- 🔗 **Dynamic Authentication**: Pipedream OAuth integration for personalized user credentials
- 🛡️ **Triple RBAC Security**: Account IDs, external user ID, and email-based access control
- 📊 **Real-time Analytics**: Comprehensive logging and performance monitoring
- 🎯 **Smart Query Parsing**: Pattern matching, keyword analysis, and AI fallback
- 📱 **Beautiful Slack UI**: Rich attachments, buttons, and interactive elements
- 🤝 **Auto-Join Public Channels**: Bot attempts to join a public channel when mentioned, so it can respond without manual invites

## Quick Setup Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Slack App
1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "API Query Bot"
4. Select your workspace
5. Click "Create App"

### 3. Configure Slack App
#### OAuth & Permissions:
Add these Bot Token Scopes:
- `chat:write`
- `app_mentions:read`
- `channels:history`
- `channels:read`  
  The bot will attempt to auto-join a public channel when mentioned using `conversations.join`. Ensure your app has the necessary permissions per Slack docs to allow joining public channels.

#### Event Subscriptions:
Enable and add these events:
- `app_mention`
- `message.channels`

#### Socket Mode:
Enable Socket Mode and generate App-Level Token

### 4. Environment Setup
1. Copy `.env.example` to `.env`
2. Fill in your Slack tokens:
   - `SLACK_BOT_TOKEN` (from OAuth & Permissions)
   - `SLACK_SIGNING_SECRET` (from Basic Information)
   - `SLACK_APP_TOKEN` (from Basic Information - App-Level Tokens)
3. Add your API configuration

### 5. Run the Bot
```bash
npm run dev
```

The bot responds to mentions like `@EnterpriseSearchBot search quarterly plan`, and will try to join the public channel automatically before replying.

## Usage
Mention the bot in any channel:
```
@EnterpriseSearchBot search for financial reports
@EnterpriseSearchBot show me recent searches
@EnterpriseSearchBot what's trending now?
@EnterpriseSearchBot suggest api documentation
```
## Project Structure
- `app.js` - Main application entry point
- `src/` - Source code directory
  - `handlers/` - Message and event handlers
  - `services/` - API and processing services
  - `utils/` - Utility functions
  - `config/` - Configuration files
