const { App } = require('@slack/bolt');
const dotenv = require('dotenv');
const queryHandler = require('./src/handlers/queryHandler');
const nlpService = require('./src/services/nlpService');
const { formatResponse } = require('./src/utils/formatter');
const apiService = require('./src/services/apiService');
const databaseConfig = require('./src/config/database');
// const { requireUserAuthentication } = require('./src/middleware/authenticateUser');
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
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   Socket Mode: ${useSocketMode ? 'Enabled' : 'Disabled'}`);
console.log(`   Port: ${process.env.PORT || 3000}`);

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
  if (useSocketMode) {
  appConfig.socketMode = true;
  appConfig.appToken = process.env.SLACK_APP_TOKEN;
  console.log('📡 Socket Mode enabled for local development');
} else {
  console.log('🌐 HTTP Mode enabled for production deployment');
  
  // ✅ SIMPLE: Add health routes using customRoutes
  appConfig.customRoutes = [
    {
      path: '/',
      method: ['GET', 'HEAD'],
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
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
  // try {
  //   const userId = await requireUserAuthentication({ email, client, channel, slackUserId, channelId });
  //   if (userId) return userId;
  //   // If not found, allow access (return a dummy userId)
  //   return slackUserId || email || 'anonymous';
  // } catch (e) {
    return slackUserId || email || 'anonymous';
  }


// Handle app mentions
app.event('app_mention', async ({ event, client, logger }) => {
  try {
    logger.info('App mention received:', event.text);
    // Ensure replies stay in the same thread
    const threadTs = event.thread_ts || event.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);

    // Try to auto-join the channel if not a member (for public channels)
    try {
      await client.conversations.join({ channel: event.channel });
      logger.info('Joined channel successfully (or already a member).');
    } catch (joinErr) {
      // Ignore if already in channel or cannot join (e.g., private channel)
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

    // Intercept admin tool intents FIRST: redirect to ES (no Slack-side connect/status)
    if (isAdminToolIntent(query)) {
      await client.chat.postMessage(withThread({ channel: event.channel, blocks: buildEsRedirectBlocks() }));
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

    // Defer UX notice until after authentication

    // Get user info to extract email for API calls
    console.log('🔍 STEP 1: Attempting to extract Slack user email...');
    console.log('   Target User ID:', event.user);
    console.log('   Channel ID:', event.channel);

    let userInfo = null;
    let extractedEmail = null;

    try {
      console.log('📞 Making Slack API call: users.info...');
      userInfo = await client.users.info({ user: event.user });

      console.log('✅ Slack API Response received');
      console.log('   User ID:', userInfo?.user?.id);
      console.log('   User Name:', userInfo?.user?.name);
      console.log('   Real Name:', userInfo?.user?.real_name);
      console.log('   Profile Email:', userInfo?.user?.profile?.email);
      console.log('   Profile Display Name:', userInfo?.user?.profile?.display_name);
      console.log('   Is Bot:', userInfo?.user?.is_bot);
      console.log('   Is Admin:', userInfo?.user?.is_admin);

      extractedEmail = userInfo?.user?.profile?.email;

      if (extractedEmail) {
        console.log('✅ SUCCESS: Email extracted from Slack profile:', extractedEmail);
      } else {
        console.log('⚠️ WARNING: No email found in Slack profile');
        console.log('   Profile object:', JSON.stringify(userInfo?.user?.profile, null, 2));
      }

    } catch (error) {
      console.log('❌ FAILED: Could not get Slack user info');
      console.log('   Error Type:', error.constructor.name);
      console.log('   Error Message:', error.message);
      console.log('   Error Code:', error.code);
      console.log('   Error Data:', error.data);

    }

    // Fallback email logic
    console.log('🔍 STEP 2: Determining email to use for API calls...');
    let finalEmail = extractedEmail;

    if (!finalEmail) {
      // Try to get from RBAC config
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
      // User not authorized, middleware has sent the denial message, stop processing
      return;
    }

    // Show typing indicator after auth is confirmed
    await client.chat.postMessage(withThread({
      channel: event.channel,
      text: "🔍 Processing your query..."
    }));

    console.log('✅ FINAL EMAIL DECISION:', finalEmail);
    console.log('   Source:', extractedEmail ? 'Slack Profile' : 'Fallback Config');

    // Process the query with user context including email
    console.log('🔍 STEP 3: Creating user context for query processing...');

    // Fetch selected company context from SlackSession (per-channel)
    let sessionCompanyId = null;
    try {
      const existingSession = await SlackSessionModel.findOne({ slackUserId: event.user, channelId: event.channel });
      sessionCompanyId = existingSession?.companyId || null;
    } catch (e) {
      console.log('⚠️ Could not read SlackSession for company context:', e.message);
    }

    const userContext = {
      slackUserId: event.user,
      slackEmail: finalEmail, // Use the determined final email
      slackName: userInfo?.user?.name || null,
      slackRealName: userInfo?.user?.real_name || null,
      extractedFromSlack: !!extractedEmail, // Track if email came from Slack
      emailSource: extractedEmail ? 'slack_profile' : 'fallback_config',
      companyId: sessionCompanyId
    };

    console.log('📋 User Context Created:', {
      slackUserId: userContext.slackUserId,
      slackEmail: userContext.slackEmail,
      emailSource: userContext.emailSource,
      extractedFromSlack: userContext.extractedFromSlack
    });

    console.log('🔍 STEP 4: Starting query processing...');
    const result = await queryHandler.processQuery(query, userContext);

    if (result.error) {
      await client.chat.postMessage(withThread({
        channel: event.channel,
        text: `❌ Error: ${result.error}`
      }));
      return;
    }

    // Handle control instructions from NLP (e.g., change company)
    if (result.type === 'control' && result.action === 'initiateCompanyChange') {
      const session = await SlackSessionModel.findOne({ slackUserId: event.user, channelId: event.channel });
      const hasSelection = !!session?.companyId;
      const text = hasSelection ? 'Change your company context' : 'No company selected yet. Please choose your company to continue.';
      const value = JSON.stringify({ userId: String(userId), slackUserId: event.user, channelId: event.channel });
      await client.chat.postEphemeral(withThread({
        channel: event.channel,
        user: event.user,
        text,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: hasSelection ? '*Change Company*' : '*Select Company*' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Choose company', emoji: true }, style: 'primary', action_id: 'open_company_picker', value }
          ]}
        ]
      }));
      return;
    }

    // Check if this is a Pipedream response (has response_type, text, attachments)
    if (result.response_type && result.text) {
      console.log('🔗 Sending Pipedream response to Slack');

      // Send Pipedream response directly
      const messagePayload = {
        channel: event.channel,
        text: result.text
      };

      // Add attachments if present
      if (result.attachments) {
        messagePayload.attachments = result.attachments;
      }

      await client.chat.postMessage(withThread(messagePayload));
      return;
    }

    // Handle regular Enterprise Search API responses
  // Handle control (change company) in DM
if (result.type === 'control' && result.action === 'initiateCompanyChange') {
  const session = await SlackSessionModel.findOne({ slackUserId: message.user, channelId: message.channel });
  const hasSelection = !!session?.companyId;
  const text = hasSelection ? 'Change your company context' : 'No company selected yet. Please choose your company to continue.';
  const value = JSON.stringify({ userId: String(userId), slackUserId: message.user, channelId: message.channel });
  await client.chat.postEphemeral(withThread({
    channel: message.channel,
    user: message.user,
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: hasSelection ? '*Change Company*' : '*Select Company*' } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Choose company', emoji: true }, style: 'primary', action_id: 'open_company_picker', value }
      ]}
    ]
  }));
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
  await client.chat.postMessage(withThread({
    channel: event.channel,
    blocks: result.blocks
  }));
  return;
}

// Handle regular Enterprise Search API responses
if (result.data) {
  const formattedResponse = formatResponse(result.data, result.apiUsed);
  await client.chat.postMessage(withThread({
    channel: event.channel,
    text: `Search results for your query`,
    blocks: formattedResponse
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
    await client.chat.postMessage(withThread({
      channel: event.channel,
      text: `❌ Sorry, I encountered an error: ${error.message}`
    }));
  }
});

// Open company picker modal
app.action('open_company_picker', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    // Maintain thread context if action triggered in a thread
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);
    const action = body?.actions?.[0];
    // ✅ ADD THIS DEBUG
    console.log('🔘 Company picker button clicked!');
    console.log('   User:', body.user.id);
    console.log('   Button value:', body.actions[0]?.value);
    let payload = {};
    try { payload = action?.value ? JSON.parse(action.value) : {}; } catch (_) { payload = {}; }
    let userId = payload.userId; // backend userId
    const slackUserId = payload.slackUserId || body.user.id;
    const channelId = payload.channelId || body.channel?.id || body.container?.channel_id;

    // Resolve userId if missing using auth middleware (fetch email first)
    if (!userId) {
      try {
        const info = await client.users.info({ user: slackUserId });
        const email = info?.user?.profile?.email;
        userId = await allowAllUserAuthentication({ email, client, channel: channelId, slackUserId, channelId });
      } catch (e) {
        logger.warn('Unable to resolve userId for modal open:', e);
      }
      if (!userId) {
        // Instead of blocking, just skip company selection and allow access
        await client.chat.postEphemeral(withThread({
          channel: channelId,
          user: slackUserId,
          text: 'Could not load companies. You can continue using the bot.'
        }));
        return;
      }
    }

    // Fetch memberships and companies
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
    if (!selected) {
      return; // Slack will keep modal; no selection
    }
    let parsed = {};
    try { parsed = selected.value ? JSON.parse(selected.value) : {}; } catch (_) { parsed = {}; }
    const { companyId, role } = parsed;
    if (!companyId) return;

    await SlackSessionModel.findOneAndUpdate(
      { slackUserId, channelId },
      { $set: { slackUserId, channelId, userId, companyId, role } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    // Modal submissions don't have thread context; send ephemeral without thread_ts
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
    // Maintain thread context if action triggered in a thread
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);

    const toolName = body.actions[0].value;
    const userId = body.user.id;

    console.log('🔘 Button clicked - Connect tool:', toolName);
    console.log('👤 User:', userId);

    // Get user info for email
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
      // Show general connect interface
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
      // Handle Slack apps connection
      const slackHandler = require('./src/handlers/slackHandler');
      result = await slackHandler.handleConnectCommand(userId);
    } else {
      // Handle specific tool connection
      result = await connectToolsHandler.handleSpecificToolConnection(userId, toolName, userEmail);
    }

    // Send response
    await client.chat.postEphemeral(withThread({
      channel: body.channel.id,
      user: userId,
      text: result.text,
      attachments: result.attachments
    }));

  } catch (error) {
    logger.error('Error handling button click:', error);
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
    // Maintain thread context if action triggered in a thread
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);
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
    // Maintain thread context for follow-up pages
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);

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

    // Call backend for trending documents with increased limit
    const resp = await apiService.callAPI('trending-documents', { limit }, slackUserId, userEmail, sessionCompanyId);
    const data = resp?.data || {};
    data._offset = nextOffset; // pass offset to formatter so it shows next page

    const blocks = formatResponse(data, 'trending-documents');
    if (channelId && messageTs) {
      await client.chat.update({ channel: channelId, ts: messageTs, blocks, text: 'Trending Documents' });
    } else {
      await client.chat.postMessage(withThread({ channel: body.channel.id, blocks }));
    }
  } catch (error) {
    logger.error('Error in trending_show_more action:', error);
    await client.chat.postEphemeral(withThread({
      channel: body.channel?.id || body.container?.channel_id,
      user: body.user.id,
      text: `❌ Error loading more: ${error.message}`
    }));
  }
});

// Search: Show more (payload carries only { user_query })
app.action('search_show_more', async ({ ack, body, client, logger }) => {
  try {
    await ack();
    // Maintain thread context for follow-up pages
    const threadTs = body.message?.thread_ts || body.container?.thread_ts || body.message?.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);

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

    const blocks = formatResponse(resp.data, 'search');
    if (channelId && messageTs) {
      await client.chat.update({ channel: channelId, ts: messageTs, blocks, text: `Search results for "${user_query}"` });
    } else {
      await client.chat.postMessage(withThread({ channel: body.channel.id, blocks }));
    }
  } catch (error) {
    logger.error('Error in search_show_more action:', error);
  }
});

// Handle direct messages
app.message(async ({ message, client, logger }) => {
  // Only respond to direct messages (not channel messages)
  if (message.channel_type !== 'im') return;
  
  try {
    logger.info('Direct message received:', message.text);
    // Ensure replies stay in the same thread in DMs
    const threadTs = message.thread_ts || message.ts;
    const withThread = (payload) => (threadTs ? { ...payload, thread_ts: threadTs } : payload);

    
    const query = message.text.trim();
    
    if (!query) return;

    // Intercept admin tool intents in DMs FIRST
    if (isAdminToolIntent(query)) {
      await client.chat.postMessage(withThread({ channel: message.channel, blocks: buildEsRedirectBlocks() }));
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

    // Show typing indicator
    // Defer UX notice until after authentication

    // Get user info to extract email for API calls
    console.log('🔍 STEP 1: Attempting to extract Slack user email...');
    console.log('   Target User ID:', message.user);
    console.log('   Channel ID:', message.channel);

    let userInfo = null;
    let extractedEmail = null;

    try {
      console.log('📞 Making Slack API call: users.info...');
      userInfo = await client.users.info({ user: message.user });

      console.log('✅ Slack API Response received');
      console.log('   User ID:', userInfo?.user?.id);
      console.log('   User Name:', userInfo?.user?.name);
      console.log('   Real Name:', userInfo?.user?.real_name);
      console.log('   Profile Email:', userInfo?.user?.profile?.email);
      console.log('   Profile Display Name:', userInfo?.user?.profile?.display_name);
      console.log('   Is Bot:', userInfo?.user?.is_bot);
      console.log('   Is Admin:', userInfo?.user?.is_admin);

      extractedEmail = userInfo?.user?.profile?.email;

      if (extractedEmail) {
        console.log('✅ SUCCESS: Email extracted from Slack profile:', extractedEmail);
      } else {
        console.log('⚠️ WARNING: No email found in Slack profile');
        console.log('   Profile object:', JSON.stringify(userInfo?.user?.profile, null, 2));
      }

    } catch (error) {
      console.log('❌ FAILED: Could not get Slack user info');
      console.log('   Error Type:', error.constructor.name);
      console.log('   Error Message:', error.message);
      console.log('   Error Code:', error.code);
      console.log('   Error Data:', error.data);

    }

    // Fallback email logic
    console.log('🔍 STEP 2: Determining email to use for API calls...');
    let finalEmail = extractedEmail;

    if (!finalEmail) {
      // Try to get from RBAC config
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

    console.log("userId with Mongodb->",userId)
    if (!userId) {
      // Access denied message sent by middleware
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

    // Format and send the response
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
  await client.chat.postMessage(withThread({
    channel: message.channel,
    blocks: result.blocks
  }));
  return;
}

// Handle regular Enterprise Search API responses
if (result.data) {
  const formattedResponse = formatResponse(result.data, result.apiUsed);
  await client.chat.postMessage(withThread({
    channel: message.channel,
    text: `Search results for your query`,
    blocks: formattedResponse
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
    await client.chat.postMessage(withThread({
      channel: message.channel,
      text: `❌ Sorry, I encountered an error: ${error.message}`
    }));
  }
});

// Add error handlers
app.error(async (error) => {
  console.error('❌ Slack App Error:', error);

  // Handle specific Socket Mode errors gracefully (only in Socket Mode)
  if (useSocketMode && error.message && (
    error.message.includes('socket') ||
    error.message.includes('WebSocket') ||
    error.message.includes('connection') ||
    error.message.includes('Unhandled event')
  )) {
    console.log('🔄 Socket Mode connection issue detected');
    console.log('   This is usually temporary and the connection will be re-established automatically');
    // Don't crash the app, let it handle reconnection automatically
    return;
  }

  // For other errors, log them but don't crash
  console.error('   Error details:', error.stack || error.message);
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
  // Handle specific Socket Mode state machine errors (only in Socket Mode)
  if (useSocketMode && error.message && error.message.includes('Unhandled event') && error.message.includes('server explicit disconnect')) {
    console.warn('⚠️ Socket Mode state machine error (this is usually harmless):');
    console.warn('   ', error.message);
    console.log('🔄 Connection will be re-established automatically');
    return; // Don't crash the app
  }

  console.error('❌ Uncaught Exception:', error);
  console.error('   Stack:', error.stack);

  // For critical errors, exit gracefully
  if (error.message && (error.message.includes('EADDRINUSE') || error.message.includes('permission'))) {
    console.error('💥 Critical error detected, exiting...');
    process.exit(1);
  }

  // For other errors, log but don't exit in development, exit in production
  if (isProduction) {
    console.error('💥 Production error, exiting for safety...');
    process.exit(1);
  } else {
    console.log('🔄 Development mode, attempting to continue...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);

  // Handle Socket Mode related rejections
  if (reason && reason.message && reason.message.includes('socket')) {
    console.log('🔄 Socket-related rejection, this is usually temporary');
    return;
  }

  // Don't exit immediately, let the app try to recover
});

// Start the app with enhanced error handling
(async () => {
  try {
    console.log('🚀 Starting Slack API Query Bot...');
    console.log('🔧 Environment check:');
    console.log('   SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? '✅ Set' : '❌ Missing');
    console.log('   SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? '✅ Set' : '❌ Missing');

    if (useSocketMode) {
      console.log('   SLACK_APP_TOKEN:', process.env.SLACK_APP_TOKEN ? '✅ Set' : '❌ Missing');
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

    // Provide specific guidance for common issues
    if (error.message && error.message.includes('token')) {
      console.error('💡 Token Error - Please check:');
      console.error('   1. SLACK_BOT_TOKEN is set correctly');
      if (useSocketMode) {
        console.error('   2. SLACK_APP_TOKEN is set correctly');
        console.error('   3. Bot has proper permissions');
      } else {
        console.error('   2. SLACK_SIGNING_SECRET is set correctly');
        console.error('   3. Webhook URL is configured in Slack app');
      }
    } else if (useSocketMode && error.message && error.message.includes('socket')) {
      console.error('💡 Socket Mode Error - Please check:');
      console.error('   1. Socket Mode is enabled in your Slack app');
      console.error('   2. App-level token has connections:write scope');
      console.error('   3. Network connectivity');
    } else if (!useSocketMode && error.message && error.message.includes('port')) {
      console.error('💡 Port Error - Please check:');
      console.error('   1. PORT environment variable is set');
      console.error('   2. Port is not already in use');
      console.error('   3. App has permission to bind to port');
    }

    process.exit(1);
  }
})();