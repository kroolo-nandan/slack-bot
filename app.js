const { App } = require('@slack/bolt');
const dotenv = require('dotenv');
const queryHandler = require('./src/handlers/queryHandler');
const nlpService = require('./src/services/nlpService');
const { formatResponse } = require('./src/utils/formatter');
const apiService = require('./src/services/apiService');
const databaseConfig = require('./src/config/database');
const SlackSessionModel = require('./src/models/SlackSession');
const MembersModel = require('./src/models/Members');
const CompanyModel = require('./src/models/Company');
const { ExpressReceiver } = require('@slack/bolt');

// Load environment variables
dotenv.config();

// Determine deployment mode
const isProduction = process.env.NODE_ENV === 'production';
const useSocketMode = process.env.USE_SOCKET_MODE !== 'false' && (process.env.USE_SOCKET_MODE === 'true' || !isProduction);

console.log('🔧 Bot Configuration:');
console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(` Socket Mode: ${useSocketMode ? 'Enabled' : 'Disabled'}`);
console.log(` Port: ${process.env.PORT || 3000}`);

// ✅ ADD: Slack response size validation function
function validateSlackBlocks(blocks) {
  try {
    const blocksJson = JSON.stringify(blocks);
    const size = new TextEncoder().encode(blocksJson).length;
    
    console.log(`📏 Slack blocks size: ${size} bytes`);
    
    // Slack's limits: 50KB total payload, 3000 chars per text block
    if (size > 45000) { // Leave 5KB buffer
      console.log(`⚠️ Blocks too large (${size} bytes), using fallback message`);
      
      return [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔍 Search completed successfully but results are too large to display in Slack.\n\n*What you can do:*\n• Try a more specific search query\n• Use the Enterprise Search dashboard for full results\n• Contact your admin for help with large result sets`
        }
      }];
    }
    
    // Check individual text blocks
    const validatedBlocks = blocks.map(block => {
      if (block.text && block.text.text && block.text.text.length > 2900) {
        return {
          ...block,
          text: {
            ...block.text,
            text: block.text.text.substring(0, 2900) + "... [truncated]"
          }
        };
      }
      return block;
    });
    
    return validatedBlocks;
  } catch (error) {
    console.error('❌ Error validating blocks:', error);
    return [{
      type: "section",
      text: {
        type: "mrkdwn",
        text: "❌ Sorry, there was an error formatting the response."
      }
    }];
  }
}

// ✅ ADD: Thread helper function
function createThreadHelper(threadTs) {
  return (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);
}

// Initialize Slack app with deployment-aware configuration
const appConfig = {
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  port: process.env.PORT || 3000
};

// Add Socket Mode configuration only if enabled
if (useSocketMode) {
  appConfig.socketMode = true;
  appConfig.appToken = process.env.SLACK_APP_TOKEN;
  console.log('📡 Socket Mode enabled for local development');
} else {
  console.log('🌐 HTTP Mode enabled for production deployment');
  
  appConfig.customRoutes = [
    {
      path: '/',
      method: ['GET', 'HEAD'],
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        
        // Register message shortcuts once
        if (!global.__KROOLO_SHORTCUTS__) {
          // Message Shortcut: Summarize the selected thread
          app.shortcut('summarize_thread_shortcut', async ({ ack, body, client, logger }) => {
            try {
              await ack();
              const channelId = body.channel?.id;
              const rootTs = body.message?.thread_ts || body.message?.ts;
              const userId = body.user?.id;
              const withThread = createThreadHelper(rootTs);

              if (!channelId || !rootTs) return;

              // Fetch thread messages
              const replies = await client.conversations.replies({ channel: channelId, ts: rootTs, limit: 100 });
              const messages = (replies?.messages || []).filter(m => (m.text && !m.subtype) || (m.bot_id && m.text));

              if (!messages.length) {
                await client.chat.postEphemeral(withThread({ channel: channelId, user: userId, text: 'No messages found in this thread.' }));
                return;
              }

              // Resolve Slack user IDs to human-readable display names
              const userIds = [...new Set(messages.map(m => m.user).filter(Boolean))];
              const nameMap = {};
              for (const uid of userIds) {
                try {
                  const ui = await client.users.info({ user: uid });
                  nameMap[uid] = ui?.user?.profile?.display_name || ui?.user?.profile?.real_name || ui?.user?.name || uid;
                } catch (_) {
                  nameMap[uid] = uid;
                }
              }

              const transcript = messages.map(m => {
                const ts = new Date(parseFloat(m.ts) * 1000).toISOString();
                const author = (m.user && nameMap[m.user]) || m.username || m.bot_profile?.name || 'unknown';
                const text = (m.text || '').replace(/\s+/g, ' ').trim();
                return `[${ts}] ${author}: ${text}`;
              }).join('\n');

              if (!nlpService.openaiClient) {
                await client.chat.postEphemeral(withThread({ channel: channelId, user: userId, text: 'Summarization is unavailable (LLM not configured).' }));
                return;
              }

              const prompt = `Summarize the following Slack thread into a concise, factual summary. Focus on: key points, decisions, outcomes, and clear action items (with owners if evident). Avoid quoting raw Slack user IDs; refer to participants by their display names. Ignore greetings and bot boilerplate. Keep it under 150-200 words.\n\nTHREAD TRANSCRIPT:\n${transcript}`;

              const completion = await nlpService.openaiClient.chat.completions.create({
                model: nlpService.getPowerfulModel(),
                messages: [
                  { role: 'system', content: 'You are an expert meeting and conversation summarizer.' },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 350
              });

              const summary = completion.choices?.[0]?.message?.content?.trim() || 'Summary not available.';

              const blocks = validateSlackBlocks([
                { type: 'header', text: { type: 'plain_text', text: '📝 Thread Summary', emoji: true } },
                { type: 'section', text: { type: 'mrkdwn', text: summary } }
              ]);

              await client.chat.postMessage(withThread({
                channel: channelId,
                text: '📝 Thread Summary',
                blocks
              }));
            } catch (error) {
              logger.error('Error in summarize_thread_shortcut:', error);
            }
          });

          // Message Shortcut: Search from the selected thread
          app.shortcut('search_from_thread_shortcut', async ({ ack, body, client, logger }) => {
            try {
              await ack();
              const channelId = body.channel?.id;
              const rootTs = body.message?.thread_ts || body.message?.ts;

              if (!channelId || !rootTs) return;

              await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                  type: 'modal',
                  callback_id: 'search_from_thread_submit',
                  private_metadata: JSON.stringify({ channelId, rootTs, userId: body.user?.id }),
                  title: { type: 'plain_text', text: 'Search from thread', emoji: true },
                  submit: { type: 'plain_text', text: 'Search', emoji: true },
                  close: { type: 'plain_text', text: 'Cancel', emoji: true },
                  blocks: [
                    { type: 'input', block_id: 'q_block', label: { type: 'plain_text', text: 'Query', emoji: true }, element: { type: 'plain_text_input', action_id: 'q_action', placeholder: { type: 'plain_text', text: 'e.g., quarterly plan' } } }
                  ]
                }
              });
            } catch (error) {
              logger.error('Error opening search_from_thread modal:', error);
            }
          });

          // Modal submit for search_from_thread
          app.view('search_from_thread_submit', async ({ ack, body, view, client, logger }) => {
            try {
              await ack();
              const meta = JSON.parse(view?.private_metadata || '{}');
              const channelId = meta.channelId;
              const rootTs = meta.rootTs;
              const userId = meta.userId || body.user?.id;
              const withThread = createThreadHelper(rootTs);

              const values = view.state.values || {};
              const query = values?.q_block?.q_action?.value?.trim();

              if (!query) return;

              // Fetch user email for RBAC
              let userEmail = null;
              try {
                const ui = await client.users.info({ user: userId });
                userEmail = ui?.user?.profile?.email || null;
              } catch (e) {
                logger.warn('users.info failed in search_from_thread_submit:', e.message);
              }

              // Company context
              let sessionCompanyId = null;
              try {
                const existingSession = await SlackSessionModel.findOne({ slackUserId: userId, channelId });
                sessionCompanyId = existingSession?.companyId || null;
              } catch (e) {
                logger.warn('SlackSession read failed in search_from_thread_submit:', e.message);
              }

              const resp = await apiService.callAPI('search', { user_query: query }, userId, userEmail, sessionCompanyId);

              if (resp.error) {
                await client.chat.postEphemeral(withThread({ channel: channelId, user: userId, text: `❌ Search failed: ${resp.error}` }));
                return;
              }

              const blocks = validateSlackBlocks(formatResponse(resp.data, 'search'));
              await client.chat.postMessage(withThread({ channel: channelId, blocks, text: `Search results for "${query}"` }));
            } catch (error) {
              logger.error('Error in search_from_thread_submit:', error);
            }
          });

          global.__KROOLO_SHORTCUTS__ = true;
        }

        res.end('Kroolo Enterprise Search Slack Bot is running!');
      }
    },
    {
      path: '/health',
      method: ['GET', 'HEAD'],
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Slack bot is healthy' }));
      }
    }
  ];
  console.log('✅ Health endpoints configured via customRoutes');
}

const app = new App(appConfig);

// Helper: detect admin-tool intents (connect/disconnect/status)
function isAdminToolIntent(text) {
  const t = (text || '').toLowerCase();
  return (
    /\b(connect|disconnect|unlink|remove)\b/.test(t) ||
    /\b(tool|app|integration)s?\s+(status|setup|manage|connections?)\b/.test(t) ||
    /\bstatus\b.*\b(tools|apps|integrations)\b/.test(t)
  );
}

function buildEsRedirectBlocks() {
  const esUrl = process.env.ES_DASHBOARD_URL || process.env.ENTERPRISE_SEARCH_URL || 'https://qastage01-app.kroolo.com/signin';
  const lines = [
    '*Connect to Enterprise Search to access the tools.*',
    '• If you are a user, contact your admin.',
    '• If you are an admin, click below to open Enterprise Search.'
  ].join('\n');
  
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `🔐 ${lines}` } },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Enterprise Search', emoji: true },
          style: 'primary',
          url: esUrl
        }
      ]
    }
  ];
}

// Helper: allow all users (fallback if not found)
async function allowAllUserAuthentication({ email, client, channel, slackUserId, channelId }) {
  return slackUserId || email || 'anonymous';
}

// Handle app mentions
app.event('app_mention', async ({ event, client, logger }) => {
  try {
    logger.info('App mention received:', event.text);
    
    // ✅ FIX: Ensure replies stay in the same thread
    const threadTs = event.thread_ts || event.ts;
    const withThread = createThreadHelper(threadTs);

    // Try to auto-join the channel if not a member (for public channels)
    try {
      await client.conversations.join({ channel: event.channel });
      logger.info('Joined channel successfully (or already a member).');
    } catch (joinErr) {
      const code = joinErr?.data?.error || joinErr.message;
      logger.warn(`conversations.join skipped: ${code}`);
    }

    // Extract the query (remove the bot mention)
    const query = event.text.replace(/<@\w+>/g, '').trim();
    if (!query) {
      await client.chat.postMessage(withThread({
        channel: event.channel,
        text: "Hi! I can help you query APIs using natural language. Try asking me something like:\n• `get user data for user ID 123`\n• `show me the latest orders`\n• `what's the status of order 456`"
      }));
      return;
    }

    // Intercept admin tool intents FIRST: redirect to ES
    if (isAdminToolIntent(query)) {
      const blocks = validateSlackBlocks(buildEsRedirectBlocks());
      await client.chat.postMessage(withThread({ channel: event.channel, blocks }));
      return;
    }

    // Quick intent checks before auth
    try {
      const nlpQuick = await nlpService.parseQuery(query);
      if (nlpQuick && nlpQuick.intent === 'general') {
        const msg = nlpQuick.parameters?.message || 'Hello! How can I help you today?';
        await client.chat.postMessage(withThread({ channel: event.channel, text: msg }));
        return;
      }
    } catch (e) {
      // If NLP fails, proceed with normal flow
    }

    // Get user info to extract email for API calls
    console.log('🔍 STEP 1: Attempting to extract Slack user email...');
    console.log(' Target User ID:', event.user);
    console.log(' Channel ID:', event.channel);

    let userInfo = null;
    let extractedEmail = null;
    
    try {
      console.log('📞 Making Slack API call: users.info...');
      userInfo = await client.users.info({ user: event.user });
      console.log('✅ Slack API Response received');
      
      extractedEmail = userInfo?.user?.profile?.email;
      if (extractedEmail) {
        console.log('✅ SUCCESS: Email extracted from Slack profile:', extractedEmail);
      } else {
        console.log('⚠️ WARNING: No email found in Slack profile');
      }
    } catch (error) {
      console.log('❌ FAILED: Could not get Slack user info');
      console.log(' Error Message:', error.message);
    }

    // Fallback email logic
    console.log('🔍 STEP 2: Determining email to use for API calls...');
    let finalEmail = extractedEmail;
    if (!finalEmail) {
      try {
        const { RBAC_CONFIG } = require('./src/config/apis');
        finalEmail = RBAC_CONFIG.user_email;
        console.log('📧 Using fallback email from RBAC config:', finalEmail);
      } catch (configError) {
        console.log('⚠️ Could not load RBAC config:', configError.message);
        finalEmail = 'default@example.com';
        console.log('📧 Using hardcoded fallback email:', finalEmail);
      }
    }

    const userId = await allowAllUserAuthentication({
      email: extractedEmail,
      client,
      channel: event.channel,
      slackUserId: event.user,
      channelId: event.channel,
    });

    if (!userId) {
      return;
    }

    // Show typing indicator
    await client.chat.postMessage(withThread({
      channel: event.channel,
      text: "🔍 Processing your query..."
    }));

    console.log('✅ FINAL EMAIL DECISION:', finalEmail);

    // Fetch selected company context from SlackSession
    let sessionCompanyId = null;
    try {
      const existingSession = await SlackSessionModel.findOne({ slackUserId: event.user, channelId: event.channel });
      sessionCompanyId = existingSession?.companyId || null;
    } catch (e) {
      console.log('⚠️ Could not read SlackSession for company context:', e.message);
    }

    const userContext = {
      slackUserId: event.user,
      slackEmail: finalEmail,
      slackName: userInfo?.user?.name || null,
      slackRealName: userInfo?.user?.real_name || null,
      extractedFromSlack: !!extractedEmail,
      emailSource: extractedEmail ? 'slack_profile' : 'fallback_config',
      companyId: sessionCompanyId
    };

    console.log('🔍 STEP 4: Starting query processing...');
    const result = await queryHandler.processQuery(query, userContext);

    if (result.error) {
      await client.chat.postMessage(withThread({
        channel: event.channel,
        text: `❌ Error: ${result.error}`
      }));
      return;
    }

    // Handle control instructions from NLP
    if (result.type === 'control' && result.action === 'initiateCompanyChange') {
      const session = await SlackSessionModel.findOne({ slackUserId: event.user, channelId: event.channel });
      const hasSelection = !!session?.companyId;
      const text = hasSelection ? 'Change your company context' : 'No company selected yet. Please choose your company to continue.';
      const value = JSON.stringify({ userId: String(userId), slackUserId: event.user, channelId: event.channel });

      const blocks = validateSlackBlocks([
        { type: 'section', text: { type: 'mrkdwn', text: hasSelection ? '*Change Company*' : '*Select Company*' } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Choose company', emoji: true }, style: 'primary', action_id: 'open_company_picker', value }
        ]}
      ]);

      await client.chat.postEphemeral(withThread({
        channel: event.channel,
        user: event.user,
        text,
        blocks
      }));
      return;
    }

    // Handle summarize thread intent
    if (result.type === 'control' && result.action === 'summarizeThread') {
      try {
        const channelId = event.channel;
        
        if (!event.thread_ts) {
          await client.chat.postEphemeral(withThread({ 
            channel: channelId, 
            user: event.user, 
            text: 'Summarize Thread works only inside an existing thread. Please open a thread and try again, or use the message shortcut from a thread.' 
          }));
          return;
        }

        const rootTs = threadTs;
        const withThread2 = createThreadHelper(rootTs);

        try {
          if (channelId && channelId.startsWith('C')) {
            await client.conversations.join({ channel: channelId });
          }
        } catch (_) {}

        const replies = await client.conversations.replies({ channel: channelId, ts: rootTs, limit: 100 });
        const messages = (replies?.messages || []).filter(m => (m.text && !m.subtype) || (m.bot_id && m.text));

        if (!messages.length) {
          await client.chat.postEphemeral(withThread2({ channel: channelId, user: event.user, text: 'No messages found in this thread.' }));
          return;
        }

        // Resolve Slack user IDs
        const userIds2 = [...new Set(messages.map(m => m.user).filter(Boolean))];
        const nameMap2 = {};
        for (const uid of userIds2) {
          try {
            const ui = await client.users.info({ user: uid });
            nameMap2[uid] = ui?.user?.profile?.display_name || ui?.user?.profile?.real_name || ui?.user?.name || uid;
          } catch (_) {
            nameMap2[uid] = uid;
          }
        }

        const transcript = messages.map(m => {
          const ts = new Date(parseFloat(m.ts) * 1000).toISOString();
          const author = (m.user && nameMap2[m.user]) || m.username || m.bot_profile?.name || 'unknown';
          const text = (m.text || '').replace(/\s+/g, ' ').trim();
          return `[${ts}] ${author}: ${text}`;
        }).join('\n');

        if (!nlpService.openaiClient) {
          await client.chat.postEphemeral(withThread2({ channel: channelId, user: event.user, text: 'Summarization is unavailable (LLM not configured).' }));
          return;
        }

        const prompt = `Summarize the following Slack thread into a concise, factual summary. Focus on: key points, decisions, outcomes, and clear action items (with owners if evident). Avoid quoting raw Slack user IDs; refer to participants by their display names. Ignore greetings and bot boilerplate. Keep it under 150-200 words.\n\nTHREAD TRANSCRIPT:\n${transcript}`;

        const completion = await nlpService.openaiClient.chat.completions.create({
          model: nlpService.getPowerfulModel(),
          messages: [
            { role: 'system', content: 'You are an expert meeting and conversation summarizer.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 350
        });

        const summary = completion.choices?.[0]?.message?.content?.trim() || 'Summary not available.';

        const blocks = validateSlackBlocks([
          { type: 'header', text: { type: 'plain_text', text: '📝 Thread Summary', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: summary } }
        ]);

        await client.chat.postMessage(withThread2({
          channel: channelId,
          text: '📝 Thread Summary',
          blocks
        }));
      } catch (e) {
        logger.error('Error summarizing thread via intent:', e);
        const missing = e?.data?.error === 'missing_scope';
        const scopeMsg = missing ? 'Missing required Slack scopes. Please add: channels:history, groups:history, im:history, mpim:history, channels:read, groups:read, im:read, mpim:read, chat:write, channels:join (public channels only), and re-install the app.' : '';
        await client.chat.postEphemeral(withThread({ channel: event.channel, user: event.user, text: `❌ Failed to summarize thread: ${e.message}${scopeMsg ? '\n' + scopeMsg : ''}` }));
      }
      return;
    }

    // Check if this is a Pipedream response
    if (result.response_type && result.text) {
      console.log('🔗 Sending Pipedream response to Slack');
      const messagePayload = {
        channel: event.channel,
        text: result.text
      };

      if (result.attachments) {
        messagePayload.attachments = result.attachments;
      }

      await client.chat.postMessage(withThread(messagePayload));
      return;
    }

    // Handle conversational responses FIRST
    if (result.type === 'conversational' || result.message) {
      await client.chat.postMessage(withThread({
        channel: event.channel,
        text: result.message
      }));
      return;
    }

    // Handle SlackHandler responses (blocks format)
    if (result.blocks) {
      const validatedBlocks = validateSlackBlocks(result.blocks);
      await client.chat.postMessage(withThread({
        channel: event.channel,
        blocks: validatedBlocks
      }));
      return;
    }

    // Handle regular Enterprise Search API responses
    if (result.data) {
      const formattedResponse = formatResponse(result.data, result.apiUsed);
      const validatedBlocks = validateSlackBlocks(formattedResponse);
      
      await client.chat.postMessage(withThread({
        channel: event.channel,
        text: `Search results for your query`,
        blocks: validatedBlocks
      }));
      return;
    }

    // Fallback for unexpected response structure
    await client.chat.postMessage(withThread({
      channel: event.channel,
      text: "I processed your request, but couldn't format the response properly."
    }));

  } catch (error) {
    logger.error('Error handling app mention:', error);
    
    // ✅ FIX: Use proper thread helper
    const threadTs = event.thread_ts || event.ts;
    const withThread = createThreadHelper(threadTs);
    
    try {
      await client.chat.postMessage(withThread({
        channel: event.channel,
        text: `❌ Sorry, I encountered an error: ${error.message}`
      }));
    } catch (sayError) {
      console.error('❌ Failed to send error message to Slack:', sayError);
    }
  }
});

// Open company picker modal
app.action('open_company_picker', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const action = body?.actions?.[0];
    console.log('🔘 Company picker button clicked!');

    let payload = {};
    try { payload = action?.value ? JSON.parse(action.value) : {}; } catch (_) { payload = {}; }

    let userId = payload.userId;
    const slackUserId = payload.slackUserId || body.user.id;
    const channelId = payload.channelId || body.channel?.id || body.container?.channel_id;

    if (!userId) {
      try {
        const info = await client.users.info({ user: slackUserId });
        const email = info?.user?.profile?.email;
        userId = await allowAllUserAuthentication({ email, client, channel: channelId, slackUserId, channelId });
      } catch (e) {
        logger.warn('Unable to resolve userId for modal open:', e);
      }
    }

    if (!userId) {
      await client.chat.postEphemeral(withThread({
        channel: channelId,
        user: slackUserId,
        text: 'Could not load companies. You can continue using the bot.'
      }));
      return;
    }

    const memberships = await MembersModel.find({ userId, status: 'ACTIVE' });
    if (!memberships || memberships.length === 0) {
      await client.chat.postEphemeral(withThread({
        channel: channelId,
        user: slackUserId,
        text: 'No active company memberships found.'
      }));
      return;
    }

    const companyIds = memberships.map(m => String(m.companyId));
    const companies = await CompanyModel.find({ companyId: { $in: companyIds } });
    const nameByCompanyId = new Map();
    companies.forEach(c => nameByCompanyId.set(String(c.companyId), c.name));

    const options = memberships.map(m => ({
      text: { type: 'plain_text', text: `${nameByCompanyId.get(String(m.companyId)) || m.companyId} (${m.role || 'user'})`, emoji: true },
      value: JSON.stringify({ companyId: String(m.companyId), role: m.role || 'user' })
    }));

    const view = {
      type: 'modal',
      callback_id: 'company_picker_submit',
      title: { type: 'plain_text', text: 'Select Company', emoji: true },
      submit: { type: 'plain_text', text: 'Use this company', emoji: true },
      close: { type: 'plain_text', text: 'Cancel', emoji: true },
      private_metadata: JSON.stringify({ userId, slackUserId, channelId }),
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: 'Choose the company you want to use with this bot:' } },
        {
          type: 'input',
          block_id: 'company_select_block',
          label: { type: 'plain_text', text: 'Company', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'company_select_action',
            placeholder: { type: 'plain_text', text: 'Select a company', emoji: true },
            options
          }
        }
      ]
    };

    await client.views.open({ trigger_id: body.trigger_id, view });
  } catch (error) {
    logger.error('Error opening company picker modal:', error);
  }
});

// Handle company picker submission
app.view('company_picker_submit', async ({ ack, body, view, client, logger }) => {
  try {
    await ack();
    const meta = JSON.parse(view?.private_metadata || '{}');
    const userId = meta.userId;
    const slackUserId = meta.slackUserId || body.user.id;
    const channelId = meta.channelId;

    const values = view.state.values || {};
    const selected = values?.company_select_block?.company_select_action?.selected_option;

    if (!selected) return;

    let parsed = {};
    try { parsed = selected.value ? JSON.parse(selected.value) : {}; } catch (_) { parsed = {}; }

    const { companyId, role } = parsed;
    if (!companyId) return;

    await SlackSessionModel.findOneAndUpdate(
      { slackUserId, channelId },
      { $set: { slackUserId, channelId, userId, companyId, role } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    await client.chat.postEphemeral({
      channel: channelId,
      user: slackUserId,
      text: '✅ Company selected. You can continue now.'
    });
  } catch (error) {
    logger.error('Error submitting company picker:', error);
  }
});

// Handle interactive components (button clicks)
app.action('connect_tool', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const toolName = body.actions[0].value;
    const userId = body.user.id;

    console.log('🔘 Button clicked - Connect tool:', toolName);

    let userInfo = null;
    try {
      userInfo = await client.users.info({ user: userId });
    } catch (error) {
      console.log('⚠️ Could not get user info for button click:', error.message);
    }

    const userEmail = userInfo?.user?.profile?.email || null;

    // Handle specific tool connection
    const connectToolsHandler = require('./src/handlers/connectToolsHandler');
    let result;

    if (toolName === 'any_tool') {
      const pipedreamService = require('./src/services/pipedreamService');
      const externalUserId = userEmail || userId;
      const connectData = await pipedreamService.createConnectToken(externalUserId);

      result = {
        response_type: 'ephemeral',
        text: '🚀 Connect Any Tool',
        attachments: [{
          color: 'good',
          title: '✅ Ready to Connect Any Tool',
          text: 'Click the button below to choose from all available tools:',
          actions: [
            {
              type: 'button',
              text: '🚀 Connect Any Tool',
              url: connectData.connect_link_url,
              style: 'primary'
            }
          ],
          footer: `🔒 Token expires: ${new Date(connectData.expires_at).toLocaleString()}`
        }]
      };
    } else if (toolName === 'slack') {
      const slackHandler = require('./src/handlers/slackHandler');
      result = await slackHandler.handleConnectCommand(userId);
    } else {
      result = await connectToolsHandler.handleSpecificToolConnection(userId, toolName, userEmail);
    }

    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: userId,
      text: result.text,
      attachments: result.attachments
    }));
  } catch (error) {
    logger.error('Error handling button click:', error);
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);
    
    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: body.user.id,
      text: `❌ Error: ${error.message}`
    }));
  }
});

// Handle company selection from first-time prompt
app.action('select_company', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const action = body?.actions?.[0];
    let parsed = {};
    try {
      parsed = action?.value ? JSON.parse(action.value) : {};
    } catch (e) {
      parsed = {};
    }

    const { companyId, role, userId, slackUserId } = parsed;
    const channelId = parsed.channelId || body?.channel?.id;

    if (!companyId || !slackUserId || !channelId) {
      await client.chat.postEphemeral(withThread({
        channel: body.channel.id,
        user: body.user.id,
        text: '⚠️ Invalid selection payload. Please try again.'
      }));
      return;
    }

    await SlackSessionModel.findOneAndUpdate(
      { slackUserId, channelId },
      { $set: { slackUserId, channelId, userId, companyId, role } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: body.user.id,
      text: `✅ Company selected. You can continue now.`
    }));
  } catch (error) {
    logger.error('Error handling select_company action:', error);
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);
    
    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: body.user.id,
      text: `❌ Error saving selection: ${error.message}`
    }));
  }
});

// Trending: Why this?
app.action(/trending_why_/, async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const action = body?.actions?.[0];
    let payload = {};
    try { payload = action?.value ? JSON.parse(action.value) : {}; } catch (_) { payload = {}; }

    const title = payload.title || 'this document';
    const why = payload.why || 'No specific reason provided by the backend.';
    const score = typeof payload.score === 'number' ? payload.score : undefined;

    const lines = [
      `• Title: ${title}`,
      payload.platform ? `• Platform: ${payload.platform}` : null,
      typeof score !== 'undefined' ? `• Score: ${score}` : null,
      `• Why: ${why}`
    ].filter(Boolean).join('\n');

    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: body.user.id,
      text: `ℹ️ Why this document?\n${lines}`
    }));
  } catch (error) {
    logger.error('Error in trending_why action:', error);
  }
});

// Trending: Search similar
app.action(/trending_similar_/, async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const action = body?.actions?.[0];
    let payload = {};
    try { payload = action?.value ? JSON.parse(action.value) : {}; } catch (_) { payload = {}; }

    const title = payload.title || 'this document';

    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: body.user.id,
      text: `🔎 You can search similar to: "${title}". Try: @enterprise_search_bot search ${title}`
    }));
  } catch (error) {
    logger.error('Error in trending_similar action:', error);
  }
});

// Trending: Show more (pagination)
app.action('trending_show_more', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const action = body?.actions?.[0];
    let payload = {};
    try { payload = action?.value ? JSON.parse(action.value) : {}; } catch (_) { payload = {}; }

    const channelId = body.channel?.id || body.container?.channel_id;
    const messageTs = body.container?.message_ts;
    const slackUserId = body.user?.id;

    const nextOffset = Number(payload.offset || payload.shown || 0);
    const total = Number(payload.total || 0);
    const nextShown = Math.min(nextOffset + 5, total || nextOffset + 5);
    const limit = Math.max(nextShown, 10);

    // Get user email for RBAC
    let userEmail = null;
    try {
      const ui = await client.users.info({ user: slackUserId });
      userEmail = ui?.user?.profile?.email || null;
    } catch (e) {
      logger.warn('Could not fetch user info in trending_show_more:', e.message);
    }

    // Get selected company from SlackSession
    let sessionCompanyId = null;
    try {
      const existingSession = await SlackSessionModel.findOne({ slackUserId, channelId });
      sessionCompanyId = existingSession?.companyId || null;
    } catch (e) {
      logger.warn('Could not read SlackSession in trending_show_more:', e.message);
    }

    const resp = await apiService.callAPI('trending-documents', { limit }, slackUserId, userEmail, sessionCompanyId);
    const data = resp?.data || {};
    data._offset = nextOffset;

    const blocks = validateSlackBlocks(formatResponse(data, 'trending-documents'));

    if (channelId && messageTs) {
      await client.chat.update({ channel: channelId, ts: messageTs, blocks, text: 'Trending Documents' });
    } else {
      await client.chat.postMessage(withThread({ channel: body.channel.id, blocks }));
    }
  } catch (error) {
    logger.error('Error in trending_show_more action:', error);
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);
    
    await client.chat.postEphemeral(withThread({
      channel: body.channel?.id || body.container?.channel_id,
      user: body.user.id,
      text: `❌ Error loading more: ${error.message}`
    }));
  }
});

// Search: Show more
app.action('search_show_more', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = createThreadHelper(threadTs);

    const action = body?.actions?.[0];
    let payload = {};
    try { payload = action?.value ? JSON.parse(action.value) : {}; } catch (_) { payload = {}; }

    const channelId = body.channel?.id || body.container?.channel_id;
    const messageTs = body.container?.message_ts;
    const slackUserId = body.user?.id;
    const user_query = payload.user_query || '';

    if (!user_query) {
      await client.chat.postEphemeral(withThread({
        channel: channelId,
        user: slackUserId,
        text: 'Could not load more results. Missing query.'
      }));
      return;
    }

    const resp = await apiService.callAPI('search', { user_query }, slackUserId, null, null);
    if (resp.error) {
      await client.chat.postEphemeral(withThread({
        channel: channelId,
        user: slackUserId,
        text: `Failed to load more results: ${resp.error}`
      }));
      return;
    }

    const blocks = validateSlackBlocks(formatResponse(resp.data, 'search'));

    if (channelId && messageTs) {
      await client.chat.update({ channel: channelId, ts: messageTs, blocks, text: `Search results for "${user_query}"` });
    } else {
      await client.chat.postMessage(withThread({ channel: body.channel.id, blocks }));
    }
  } catch (error) {
    logger.error('Error in search_show_more action:', error);
  }
});

// Slash command: /find
app.command('/find', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const channelId = body.channel_id;
    const userId = body.user_id;
    const rawQuery = (body.text || '').trim();
    const threadTs = body.thread_ts || body.message_ts;
    const withThread = createThreadHelper(threadTs);

    if (!rawQuery) {
      await client.chat.postEphemeral(withThread({
        channel: channelId,
        user: userId,
        text: 'Usage: /find <search query>'
      }));
      return;
    }

    // Get user email for RBAC
    let userEmail = null;
    try {
      const ui = await client.users.info({ user: userId });
      userEmail = ui?.user?.profile?.email || null;
    } catch (e) {
      logger.warn('users.info failed for /find:', e.message);
    }

    // Get selected company from SlackSession
    let sessionCompanyId = null;
    try {
      const existingSession = await SlackSessionModel.findOne({ slackUserId: userId, channelId });
      sessionCompanyId = existingSession?.companyId || null;
    } catch (e) {
      logger.warn('SlackSession read failed in /find:', e.message);
    }

    const resp = await apiService.callAPI('search', { user_query: rawQuery }, userId, userEmail, sessionCompanyId);

    if (resp.error) {
      await client.chat.postEphemeral(withThread({
        channel: channelId,
        user: userId,
        text: `❌ Search failed: ${resp.error}`
      }));
      return;
    }

    const blocks = validateSlackBlocks(formatResponse(resp.data, 'search'));
    await client.chat.postMessage(withThread({ channel: channelId, blocks, text: `Search results for "${rawQuery}"` }));
  } catch (error) {
    logger.error('Error in /find command:', error);
  }
});

// Slash command: /summarize-thread
app.command('/summarize-thread', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    const channelId = body.channel_id;
    const userId = body.user_id;
    const threadTs = body.thread_ts || body.message_ts;
    const withThread = createThreadHelper(threadTs);

    if (!threadTs) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Please run /summarize-thread inside a thread so I can summarize it.'
      });
      return;
    }

    const replies = await client.conversations.replies({ channel: channelId, ts: threadTs, limit: 100 });
    const messages = (replies?.messages || []).filter(m => (m.text && !m.subtype) || (m.bot_id && m.text));

    if (!messages.length) {
      await client.chat.postEphemeral(withThread({ channel: channelId, user: userId, text: 'No messages found in this thread.' }));
      return;
    }

    const transcript = messages.map(m => {
      const ts = new Date(parseFloat(m.ts) * 1000).toISOString();
      const author = m.user || m.username || m.bot_profile?.name || 'unknown';
      const text = (m.text || '').replace(/\s+/g, ' ').trim();
      return `[${ts}] ${author}: ${text}`;
    }).join('\n');

    if (!nlpService.openaiClient) {
      await client.chat.postEphemeral(withThread({ channel: channelId, user: userId, text: 'Summarization is unavailable (LLM not configured).' }));
      return;
    }

    const prompt = `Summarize the following Slack thread into a concise, factual summary with key points and decisions. If action items appear, list them. Keep it under 150-200 words.\n\nTHREAD TRANSCRIPT:\n${transcript}`;

    const completion = await nlpService.openaiClient.chat.completions.create({
      model: nlpService.getPowerfulModel(),
      messages: [
        { role: 'system', content: 'You are an expert meeting and conversation summarizer.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 350
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || 'Summary not available.';

    const blocks = validateSlackBlocks([
      { type: 'header', text: { type: 'plain_text', text: '📝 Thread Summary', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: summary } }
    ]);

    await client.chat.postMessage(withThread({
      channel: channelId,
      text: '📝 Thread Summary',
      blocks
    }));
  } catch (error) {
    logger.error('Error in /summarize-thread command:', error);
    try {
      const channelId = body.channel_id;
      const userId = body.user_id;
      const threadTs = body.thread_ts || body.message_ts;
      const withThread = createThreadHelper(threadTs);
      
      await client.chat.postEphemeral(withThread({ 
        channel: channelId, 
        user: userId, 
        text: `❌ Summarization failed: ${error.message}` 
      }));
    } catch (_) { /* ignore */ }
  }
});

// Handle direct messages
app.message(async ({ message, client, logger }) => {
  // Only respond to direct messages (not channel messages)
  if (message.channel_type !== 'im') return;

  try {
    logger.info('Direct message received:', message.text);
    const threadTs = message.thread_ts || message.ts;
    const withThread = createThreadHelper(threadTs);

    const query = message.text.trim();
    if (!query) return;

    // Intercept admin tool intents in DMs FIRST
    if (isAdminToolIntent(query)) {
      const blocks = validateSlackBlocks(buildEsRedirectBlocks());
      await client.chat.postMessage(withThread({ channel: message.channel, blocks }));
      return;
    }

    // Quick intent checks before auth in DMs
    try {
      const nlpQuick = await nlpService.parseQuery(query);
      if (nlpQuick && nlpQuick.intent === 'general') {
        const msg = nlpQuick.parameters?.message || 'Hello! How can I help you today?';
        await client.chat.postMessage(withThread({ channel: message.channel, text: msg }));
        return;
      }
    } catch (e) {
      // If NLP fails, proceed with normal flow
    }

    // Get user info to extract email for API calls
    console.log('🔍 STEP 1: Attempting to extract Slack user email...');
    
    let userInfo = null;
    let extractedEmail = null;
    
    try {
      userInfo = await client.users.info({ user: message.user });
      extractedEmail = userInfo?.user?.profile?.email;
      
      if (extractedEmail) {
        console.log('✅ SUCCESS: Email extracted from Slack profile:', extractedEmail);
      } else {
        console.log('⚠️ WARNING: No email found in Slack profile');
      }
    } catch (error) {
      console.log('❌ FAILED: Could not get Slack user info:', error.message);
    }

    // Fallback email logic
    let finalEmail = extractedEmail;
    if (!finalEmail) {
      try {
        const { RBAC_CONFIG } = require('./src/config/apis');
        finalEmail = RBAC_CONFIG.user_email;
        console.log('📧 Using fallback email from RBAC config:', finalEmail);
      } catch (configError) {
        console.log('⚠️ Could not load RBAC config:', configError.message);
        finalEmail = 'default@example.com';
        console.log('📧 Using hardcoded fallback email:', finalEmail);
      }
    }

    const userId = await allowAllUserAuthentication({
      email: userInfo?.user?.profile?.email,
      client,
      channel: message.channel,
      slackUserId: message.user,
      channelId: message.channel,
    });

    console.log("userId with Mongodb->", userId);

    if (!userId) {
      return;
    }

    // Process the query with user context including email
    const userContext = {
      slackUserId: message.user,
      slackEmail: userInfo?.user?.profile?.email || null,
      slackName: userInfo?.user?.name || null,
      slackRealName: userInfo?.user?.real_name || null
    };

    const result = await queryHandler.processQuery(query, userContext);

    if (result.error) {
      await client.chat.postMessage(withThread({
        channel: message.channel,
        text: `❌ Error: ${result.error}`
      }));
      return;
    }

    // Handle conversational responses FIRST
    if (result.type === 'conversational' || result.message) {
      await client.chat.postMessage(withThread({
        channel: message.channel,
        text: result.message
      }));
      return;
    }

    // Handle SlackHandler responses (blocks format)
    if (result.blocks) {
      const validatedBlocks = validateSlackBlocks(result.blocks);
      await client.chat.postMessage(withThread({
        channel: message.channel,
        blocks: validatedBlocks
      }));
      return;
    }

    // Handle regular Enterprise Search API responses
    if (result.data) {
      const formattedResponse = formatResponse(result.data, result.apiUsed);
      const validatedBlocks = validateSlackBlocks(formattedResponse);
      
      await client.chat.postMessage(withThread({
        channel: message.channel,
        text: `Search results for your query`,
        blocks: validatedBlocks
      }));
      return;
    }

    // Fallback for unexpected response structure
    await client.chat.postMessage(withThread({
      channel: message.channel,
      text: "I processed your request, but couldn't format the response properly."
    }));
  } catch (error) {
    logger.error('Error handling direct message:', error);
    const threadTs = message.thread_ts || message.ts;
    const withThread = createThreadHelper(threadTs);
    
    await client.chat.postMessage(withThread({
      channel: message.channel,
      text: `❌ Sorry, I encountered an error: ${error.message}`
    }));
  }
});

// Add error handlers
app.error(async (error) => {
  console.error('❌ Slack App Error:', error);
  
  if (useSocketMode && error.message && (
    error.message.includes('socket') ||
    error.message.includes('WebSocket') ||
    error.message.includes('connection') ||
    error.message.includes('Unhandled event')
  )) {
    console.log('🔄 Socket Mode connection issue detected');
    console.log(' This is usually temporary and the connection will be re-established automatically');
    return;
  }

  console.error(' Error details:', error.stack || error.message);
});

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  try {
    await app.stop();
    console.log('✅ App stopped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  try {
    await app.stop();
    console.log('✅ App stopped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  if (useSocketMode && error.message && error.message.includes('Unhandled event') && error.message.includes('server explicit disconnect')) {
    console.warn('⚠️ Socket Mode state machine error (this is usually harmless):');
    console.warn(' ', error.message);
    console.log('🔄 Connection will be re-established automatically');
    return;
  }

  console.error('❌ Uncaught Exception:', error);
  console.error(' Stack:', error.stack);
  
  if (error.message && (error.message.includes('EADDRINUSE') || error.message.includes('permission'))) {
    console.error('💥 Critical error detected, exiting...');
    process.exit(1);
  }

  if (isProduction) {
    console.error('💥 Production error, exiting for safety...');
    process.exit(1);
  } else {
    console.log('🔄 Development mode, attempting to continue...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  
  if (reason && reason.message && reason.message.includes('socket')) {
    console.log('🔄 Socket-related rejection, this is usually temporary');
    return;
  }
});

// Start the app with enhanced error handling
(async () => {
  try {
    console.log('🚀 Starting Slack API Query Bot...');
    console.log('🔧 Environment check:');
    console.log(' SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? '✅ Set' : '❌ Missing');
    console.log(' SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? '✅ Set' : '❌ Missing');
    
    if (useSocketMode) {
      console.log(' SLACK_APP_TOKEN:', process.env.SLACK_APP_TOKEN ? '✅ Set' : '❌ Missing');
    }

    // Initialize database connection
    console.log('🔄 Initializing database connection...');
    try {
      await databaseConfig.initialize();
      console.log('✅ Database initialized successfully');
    } catch (dbError) {
      console.error('❌ Database initialization failed:', dbError.message);
      console.warn('⚠️ Continuing without database - using in-memory storage');
    }

    await app.start();
    
    console.log('⚡️ Slack API Query Bot is running!');
    console.log(`🚀 Server started on port ${process.env.PORT || 3000}`);
    
    if (useSocketMode) {
      console.log('📡 Socket Mode connection established');
    } else {
      console.log('🌐 HTTP Mode - Ready to receive webhook requests');
      console.log('📋 Webhook URL: https://your-app.onrender.com/slack/events');
      console.log('✅ Server is listening and ready for deployment');
    }
  } catch (error) {
    console.error('❌ Failed to start the app:', error);
    
    if (error.message && error.message.includes('token')) {
      console.error('💡 Token Error - Please check:');
      console.error(' 1. SLACK_BOT_TOKEN is set correctly');
      if (useSocketMode) {
        console.error(' 2. SLACK_APP_TOKEN is set correctly');
        console.error(' 3. Bot has proper permissions');
      } else {
        console.error(' 2. SLACK_SIGNING_SECRET is set correctly');
        console.error(' 3. Webhook URL is configured in Slack app');
      }
    } else if (useSocketMode && error.message && error.message.includes('socket')) {
      console.error('💡 Socket Mode Error - Please check:');
      console.error(' 1. Socket Mode is enabled in your Slack app');
      console.error(' 2. App-level token has connections:write scope');
      console.error(' 3. Network connectivity');
    } else if (!useSocketMode && error.message && error.message.includes('port')) {
      console.error('💡 Port Error - Please check:');
      console.error(' 1. PORT environment variable is set');
      console.error(' 2. Port is not already in use');
      console.error(' 3. App has permission to bind to port');
    }

    process.exit(1);
  }
})();
