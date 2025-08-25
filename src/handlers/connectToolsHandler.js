// Unified Connect Tools Handler
// Handles both Pipedream tools (Google Drive, Gmail, GitHub) and Slack apps
// Creates the interface shown in the screenshot

const { getUserConnections } = require('../services/databaseService');
const pipedreamService = require('../services/pipedreamService');
const slackService = require('../services/slackService');

class ConnectToolsHandler {
  constructor() {
    console.log('🔧 Connect Tools Handler initialized');
  }

  // Handle unified "connect tools" or "connect pipedream" command
  async handleConnectToolsCommand(slackUserId, userContext = null) {
    try {
      console.log('\n🔗 ===== CONNECT TOOLS PROCESSING START =====');
      console.log('🔗 STEP 1: Processing unified connect tools command');
      console.log('   Slack User ID:', slackUserId);
      console.log('   User Context Received:', !!userContext);
      console.log('   User Context Details:', JSON.stringify(userContext, null, 2));

      // Extract user email from Slack user context for API calls
      console.log('🔗 STEP 2: Determining user email for API calls...');
      let userEmail = null;
      let emailSource = 'none';

      if (userContext && userContext.slackEmail) {
        userEmail = userContext.slackEmail;
        emailSource = userContext.emailSource || 'slack_profile';
        console.log('✅ EMAIL SUCCESS: Using email from user context');
        console.log('   Email:', userEmail);
        console.log('   Source:', emailSource);
        console.log('   Extracted from Slack:', userContext.extractedFromSlack);
      } else {
        console.log('⚠️ EMAIL FALLBACK: No email in user context, trying RBAC config...');
        try {
          const { RBAC_CONFIG } = require('../config/apis');
          userEmail = RBAC_CONFIG.user_email;
          emailSource = 'rbac_config';
          console.log('✅ EMAIL FALLBACK SUCCESS: Using email from RBAC config');
          console.log('   Email:', userEmail);
          console.log('   Source:', emailSource);
        } catch (configError) {
          console.log('❌ EMAIL FALLBACK FAILED: Could not load RBAC config');
          console.log('   Error:', configError.message);
          userEmail = 'default@example.com';
          emailSource = 'hardcoded_fallback';
          console.log('📧 EMAIL FINAL FALLBACK: Using hardcoded email:', userEmail);
        }
      }

      console.log('🔗 STEP 3: Final email decision made');
      console.log('   Final Email:', userEmail);
      console.log('   Email Source:', emailSource);
      console.log('   Will be used as external_user_id for Pipedream API');

      // Create tokens for all popular tools upfront (simpler approach)
      console.log('🔧 Creating tokens for all popular tools upfront');

      const externalUserId = slackUserId || userEmail;
      console.log('🔗 Creating Pipedream Connect tokens for external user:', externalUserId);

      // Create tokens for all available tools (updated list)
      const tools = [
        'google_drive',
        'dropbox',
        'jira',
        'confluence',
        'microsoft_teams',
        'microsoft_sharepoint',
        'document_360',
        'gmail',
        'github',
        'notion',
        'airtable'
      ];
      const toolUrls = {};

      console.log('🔍 TOKEN STEP 1: Attempting to create Pipedream tokens...');
      console.log('   External User ID:', externalUserId);
      console.log('   Tools to create:', tools);

      try {
        console.log('🔍 TOKEN STEP 2: Calling Pipedream service...');
        const generalToken = await pipedreamService.createConnectToken(externalUserId);

        console.log('✅ TOKEN STEP 3: Token created successfully');
        console.log('   Token preview:', generalToken.token ? `${generalToken.token.substring(0, 20)}...` : 'No token');
        console.log('   Expires at:', generalToken.expires_at);

        // Generate URLs for each tool
        console.log('🔍 TOKEN STEP 4: Generating tool-specific URLs...');
        for (const tool of tools) {
          toolUrls[tool] = `https://pipedream.com/_static/connect.html?token=${generalToken.token}&connectLink=true&app=${tool}`;
          console.log(`   ${tool}: ${toolUrls[tool].substring(0, 80)}...`);
        }

        // General URL
        toolUrls.any_tool = generalToken.connect_link_url;
        console.log(`   any_tool: ${toolUrls.any_tool.substring(0, 80)}...`);

        console.log('✅ TOKEN STEP 5: All URLs generated successfully');

        // Set up connection tracking for when user successfully connects
        this.setupConnectionTracking(userEmail || slackUserId, Object.keys(toolUrls));

        return this.showToolSelectionWithUrls(slackUserId, userEmail, toolUrls, generalToken);

      } catch (error) {
        console.error('❌ TOKEN STEP ERROR: Failed to create real tokens');
        console.error('   Error message:', error.message);
        console.error('   Error type:', error.constructor.name);

      }


    } catch (error) {
      console.error('❌ Error in unified connect tools command:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error connecting to tools. Please try again later.',
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Handle "connect all tools" command - shows everything
  async handleConnectAllToolsCommand(slackUserId, userContext = null) {
    try {
      console.log('🔗 Processing connect all tools command for user:', slackUserId);

      // Create Pipedream connect token
      const connectData = await pipedreamService.createConnectToken(slackUserId);

      // Get all available tools
      const pipedreamApps = pipedreamService.getPopularApps();

      return {
        response_type: 'ephemeral',
        text: '🛠️ Connect All Available Tools',
        attachments: [{
          color: 'good',
          title: '🔗 Pipedream Tools',
          text: 'Connect external tools via Pipedream:',
          fields: pipedreamApps.slice(0, 6).map(app => ({
            title: `${app.icon} ${app.name}`,
            value: `Connect ${app.name}`,
            short: true
          })),
          actions: [
            {
              type: 'button',
              text: '🚀 Connect Any Pipedream App',
              url: connectData.connect_link_url,
              style: 'primary'
            }
          ]
        }, {
          color: '#4A154B',
          title: '💬 Slack Tools',
          text: 'Connect Slack-specific tools:',
          fields: slackApps.slice(0, 6).map(app => ({
            title: `${app.icon} ${app.name}`,
            value: app.description,
            short: true
          })),
          actions: [
            {
              type: 'button',
              text: '💬 Connect Slack Apps',
              name: 'connect_slack_apps',
              value: 'connect_slack',
              style: 'default'
            }
          ]
        }, {
          color: '#36a64f',
          title: '⚡ Quick Actions',
          text: 'Popular tool connections:',
          actions: [
            {
              type: 'button',
              text: '📁 Google Drive',
              url: `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=google_drive`,
              style: 'default'
            },
            {
              type: 'button',
              text: '📧 Gmail',
              url: `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=gmail`,
              style: 'default'
            },
            {
              type: 'button',
              text: '🐙 GitHub',
              url: `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=github`,
              style: 'default'
            }
          ]
        }]
      };

    } catch (error) {
      console.error('❌ Error in connect all tools command:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error connecting to tools. Please try again later.',
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Show clean tool selection interface (no copy-paste URLs)
    // Show clean tool selection interface (no copy-paste URLs)
  showToolSelectionWithUrls(slackUserId, userEmail = null, toolUrls = {}, tokenData = null) {
    console.log('🔧 Showing clean tool selection interface for user:', slackUserId);
    console.log('📧 User email:', userEmail || 'Not available');
    console.log('🔗 Generated URLs for tools:', Object.keys(toolUrls).length);

    return {
      response_type: 'ephemeral',
      text: '🛠️ Connect Your Tools',
      attachments: [{
        color: 'good',
        title: '🔗 Primary Tools',
        text: 'Click to connect your most used tools:',
        actions: [
          {
            type: 'button',
            text: '📁 Google Drive',
            url: toolUrls.google_drive,
            style: 'primary'
          },
          {
            type: 'button',
            text: '📧 Gmail',
            url: toolUrls.gmail,
            style: 'default'
          },
          {
            type: 'button',
            text: '📦 Dropbox',
            url: toolUrls.dropbox,
            style: 'default'
          }
        ]
      }, {
        color: '#36a64f',
        title: '🏢 Enterprise Tools',
        text: 'Connect your business and collaboration tools:',
        actions: [
          {
            type: 'button',
            text: '🎯 Jira',
            url: toolUrls.jira,
            style: 'default'
          },
          {
            type: 'button',
            text: '📖 Confluence',
            url: toolUrls.confluence,
            style: 'default'
          },
          {
            type: 'button',
            text: '💬 Microsoft Teams',
            url: toolUrls.microsoft_teams,
            style: 'default'
          }
        ]
      }, {
        color: '#0078d4',
        title: '📊 Microsoft & Documentation',
        text: 'Connect Microsoft services and documentation tools:',
        actions: [
          {
            type: 'button',
            text: '📋 SharePoint',
            url: toolUrls.microsoft_sharepoint,
            style: 'default'
          },
          {
            type: 'button',
            text: '📚 Document 360',
            url: toolUrls.document_360,
            style: 'default'
          },
          {
            type: 'button',
            text: '🐙 GitHub',
            url: toolUrls.github,
            style: 'default'
          }
        ]
      }, {
        color: '#4A154B',
        title: '🎨 Productivity Tools',
        text: 'Connect additional productivity and note-taking tools:',
        actions: [
          {
            type: 'button',
            text: '📝 Notion',
            url: toolUrls.notion,
            style: 'default'
          },
          {
            type: 'button',
            text: '📊 Airtable',
            url: toolUrls.airtable,
            style: 'default'
          },
          {
            type: 'button',
            text: '🚀 Browse All Tools',
            url: toolUrls.any_tool,
            style: 'primary'
          }
        ]
      }]
    };
  }
 // Handle specific tool connection after user selects
  async handleSpecificToolConnection(slackUserId, toolName, userEmail = null) {
    try {
      console.log('🔗 Connecting specific tool:', toolName);
      console.log('👤 User:', slackUserId);
      console.log('📧 Email:', userEmail);

      // Create Pipedream connect token with user email as external_user_id
      const externalUserId = slackUserId || userEmail;
      console.log('🔗 Creating Pipedream Connect token for external user:', externalUserId);

      const connectData = await pipedreamService.createConnectToken(externalUserId, toolName);

      // Generate the specific tool URL
      const toolUrl = `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=${toolName}`;

      return {
        response_type: 'ephemeral',
        text: `🔗 Connect ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`,
        attachments: [{
          color: 'good',
          title: `✅ Ready to Connect ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`,
          text: `Click the button below to connect your ${toolName} account:`,
          actions: [
            {
              type: 'button',
              text: `🔗 Connect ${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`,
              url: toolUrl,
              style: 'primary'
            }
          ],
          footer: `🔒 Token expires: ${new Date(connectData.expires_at).toLocaleString()} (${Math.round((new Date(connectData.expires_at) - new Date()) / 1000 / 60)} min)`
        }]
      };

    } catch (error) {
      console.error('❌ Error connecting specific tool:', error.message);
      return {
        response_type: 'ephemeral',
        text: `❌ Error connecting ${toolName}. Please try again later.`,
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Handle direct tool connection request (e.g., "connect google drive")
  async handleDirectToolConnection(slackUserId, toolName, userEmail = null) {
    try {
      console.log('🔗 Direct tool connection request:', toolName);
      console.log('👤 User:', slackUserId);
      console.log('📧 Email:', userEmail);

      const externalUserId = slackUserId || userEmail;
      const connectData = await pipedreamService.createConnectToken(externalUserId);

      const toolUrl = `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=${toolName}`;

      return {
        response_type: 'ephemeral',
        text: `🔗 Connect ${toolName.charAt(0).toUpperCase() + toolName.slice(1).replace('_', ' ')}`,
        attachments: [{
          color: 'good',
          title: `✅ Ready to Connect ${toolName.charAt(0).toUpperCase() + toolName.slice(1).replace('_', ' ')}`,
          text: `Click the button below to connect your ${toolName.replace('_', ' ')} account:`,
          actions: [
            {
              type: 'button',
              text: `🔗 Connect ${toolName.charAt(0).toUpperCase() + toolName.slice(1).replace('_', ' ')}`,
              url: toolUrl,
              style: 'primary'
            }
          ],
          footer: `🔒 Token expires: ${new Date(connectData.expires_at).toLocaleString()} (${Math.round((new Date(connectData.expires_at) - new Date()) / 1000 / 60)} min)`
        }]
      };

    } catch (error) {
      console.error('❌ Error creating direct tool connection:', error.message);
      return {
        response_type: 'ephemeral',
        text: `❌ Error connecting ${toolName}. Please try again later.`,
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Parse connect tools commands
  parseConnectToolsCommand(query) {
    const normalizedQuery = query.toLowerCase().trim();

    // Direct tool connections - Primary tools
    if (normalizedQuery.includes('connect google drive') || normalizedQuery.includes('google drive connect')) {
      return { command: 'direct_tool', type: 'google_drive' };
    }
    if (normalizedQuery.includes('connect gmail') || normalizedQuery.includes('gmail connect')) {
      return { command: 'direct_tool', type: 'gmail' };
    }
    if (normalizedQuery.includes('connect dropbox') || normalizedQuery.includes('dropbox connect')) {
      return { command: 'direct_tool', type: 'dropbox' };
    }

    // Enterprise tools
    if (normalizedQuery.includes('connect jira') || normalizedQuery.includes('jira connect')) {
      return { command: 'direct_tool', type: 'jira' };
    }
    if (normalizedQuery.includes('connect confluence') || normalizedQuery.includes('confluence connect')) {
      return { command: 'direct_tool', type: 'confluence' };
    }
    if (normalizedQuery.includes('connect microsoft teams') || normalizedQuery.includes('teams connect') || normalizedQuery.includes('microsoft teams connect')) {
      return { command: 'direct_tool', type: 'microsoft_teams' };
    }
    if (normalizedQuery.includes('connect sharepoint') || normalizedQuery.includes('sharepoint connect') || normalizedQuery.includes('microsoft sharepoint')) {
      return { command: 'direct_tool', type: 'microsoft_sharepoint' };
    }
    if (normalizedQuery.includes('connect document 360') || normalizedQuery.includes('document 360 connect') || normalizedQuery.includes('document360')) {
      return { command: 'direct_tool', type: 'document_360' };
    }

    // Development and productivity tools
    if (normalizedQuery.includes('connect github') || normalizedQuery.includes('github connect')) {
      return { command: 'direct_tool', type: 'github' };
    }
    if (normalizedQuery.includes('connect notion') || normalizedQuery.includes('notion connect')) {
      return { command: 'direct_tool', type: 'notion' };
    }
    if (normalizedQuery.includes('connect airtable') || normalizedQuery.includes('airtable connect')) {
      return { command: 'direct_tool', type: 'airtable' };
    }

    // Connect tools/pipedream commands
    if (normalizedQuery.includes('connect tools') ||
      normalizedQuery.includes('connect pipedream') ||
      normalizedQuery.includes('tools connect') ||
      normalizedQuery.includes('pipedream connect')) {
      return { command: 'connect_tools', type: 'unified' };
    }

    if (normalizedQuery.includes('connect all tools') ||
      normalizedQuery.includes('all tools connect')) {
      return { command: 'connect_all_tools', type: 'unified' };
    }

    // Connection management commands
    if (normalizedQuery.includes('show connections') ||
      normalizedQuery.includes('my connections') ||
      normalizedQuery.includes('connection status') ||
      normalizedQuery.includes('list connections')) {
      return { command: 'show_connections' };
    }

    if (normalizedQuery.includes('manage connections') ||
      normalizedQuery.includes('manage tools') ||
      normalizedQuery.includes('tool management')) {
      return { command: 'manage_connections' };
    }

    if (normalizedQuery.includes('disconnect') && !normalizedQuery.includes('connect')) {
      // Parse which tool to disconnect
      const toolMatch = this.extractToolFromDisconnectQuery(normalizedQuery);
      return { command: 'disconnect_tool', type: toolMatch };
    }

    return null;
  }

  // Extract tool name from disconnect query
  extractToolFromDisconnectQuery(query) {
    const tools = [
      'google_drive', 'gmail', 'dropbox', 'jira', 'confluence',
      'microsoft_teams', 'microsoft_sharepoint', 'document_360',
      'github', 'notion', 'airtable'
    ];

    const queryLower = query.toLowerCase();

    // Check for specific tool mentions
    for (const tool of tools) {
      const toolVariations = [
        tool,
        tool.replace('_', ' '),
        tool.replace('microsoft_', ''),
        tool.replace('_360', ' 360')
      ];

      for (const variation of toolVariations) {
        if (queryLower.includes(variation)) {
          return tool;
        }
      }
    }

    return null; // No specific tool found
  }

  // Handle unified connect tools commands
  async handleCommand(command, slackUserId, userContext = null) {
    try {
      console.log('🔧 Handling connect tools command:', command.command);
      console.log('👤 User context received:', userContext ? 'Yes' : 'No');

      const userEmail = userContext?.slackEmail || null;

      switch (command.command) {
        case 'connect_tools':
          return await this.handleConnectToolsCommand(slackUserId, userContext);

        case 'connect_all_tools':
          return await this.handleConnectAllToolsCommand(slackUserId, userContext);

        case 'direct_tool':
          return await this.handleDirectToolConnection(slackUserId, command.type, userEmail);

        case 'show_connections':
          return await this.handleShowConnections(slackUserId, userEmail);

        case 'manage_connections':
          return await this.handleManageConnections(slackUserId, userEmail);

        case 'disconnect_tool':
          return await this.handleDisconnectTool(slackUserId, command.type, userEmail);

        default:
          console.log('❌ Unknown connect tools command:', command.command);
          return {
            error: `Unknown connect tools command: ${command.command}`
          };
      }
    } catch (error) {
      console.error('❌ Error handling connect tools command:', error.message);
      return {
        error: `Error processing connect tools command: ${error.message}`
      };
    }
  }

  // ===== CONNECTION MANAGEMENT METHODS =====

  // Show user's current connections
  async handleShowConnections(slackUserId, userEmail) {
    console.log('📊 Showing connections for user:', slackUserId);

    try {
      const connectionData = await getUserConnections(slackUserId, userEmail);

      const hasConnections = connectionData.appNames.length > 0;

      if (hasConnections) {
        return {
          response_type: 'ephemeral',
          text: '🔗 Your Connected Tools',
          attachments: [{
            color: 'good',
            title: `✅ Connected Tools (${connectionData.appNames.length})`,
            text: 'You have connected the following tools:',
            fields: connectionData.appNames.map((app, i) => ({
              title: this.getToolDisplayName(app),
            }))
          }]
        };
      } else {
        return {
          response_type: 'ephemeral',
          text: '🔗 Your Connected Tools',
          attachments: [{
            color: 'warning',
            title: '📭 No Connections Found',
            text: 'You haven\'t connected any tools yet.',
            actions: [
              {
                type: 'button',
                text: '🔗 Connect Tools',
                value: 'connect_tools_action',
                style: 'primary'
              }
            ]
          }]
        };
      }
    } catch (error) {
      console.error('❌ Error showing connections:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error loading your connections. Please try again later.'
      };
    }
  }



  // Handle tool disconnection connection status
  async handleDisconnectTool(slackUserId, toolType, userEmail) {
    console.log('🗑️ Disconnecting tool for user:', slackUserId, 'tool:', toolType);

    if (!toolType) {
      return {
        response_type: 'ephemeral',
        text: '❌ Please specify which tool to disconnect',
        attachments: [{
          color: 'warning',
          title: '🤔 Which tool do you want to disconnect?',
          text: 'Try commands like:',
          fields: [
            {
              title: 'Examples',
              value: '• `@Kroolo AI disconnect google drive`\n• `@Kroolo AI disconnect jira`\n• `@Kroolo AI disconnect notion`',
              short: false
            }
          ]
        }]
      };
    }

    try {
      const result = await pipedreamService.removeUserConnection(slackUserId, toolType);

      if (result.success) {
        return {
          response_type: 'ephemeral',
          text: '✅ Tool Disconnected Successfully',
          attachments: [{
            color: 'good',
            title: `🗑️ ${this.getToolDisplayName(toolType)} Disconnected`,
            text: result.message,
            fields: [
              {
                title: '🔍 Search Impact',
                value: 'This tool will no longer be included in your searches',
                short: true
              }
            ],
            actions: [
              {
                type: 'button',
                text: '🔗 Reconnect Tool',
                value: 'connect_tools_action',
                style: 'primary'
              },
              {
                type: 'button',
                text: '📊 View All Connections',
                value: 'show_connections_action',
                style: 'default'
              }
            ]
          }]
        };
      } else {
        return {
          response_type: 'ephemeral',
          text: '❌ Failed to Disconnect Tool',
          attachments: [{
            color: 'danger',
            title: `🗑️ Could not disconnect ${this.getToolDisplayName(toolType)}`,
            text: result.message,
            actions: [
              {
                type: 'button',
                text: '🔄 Try Again',
                value: `disconnect_${toolType}`,
                style: 'default'
              }
            ]
          }]
        };
      }

    } catch (error) {
      console.error('❌ Error disconnecting tool:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error disconnecting tool. Please try again later.'
      };
    }
  }

  // Helper method to get display name for tools
  getToolDisplayName(appName) {
    const displayNames = {
      'google_drive': '📁 Google Drive',
      'gmail': '📧 Gmail',
      'dropbox': '📦 Dropbox',
      'jira': '🎯 Jira',
      'confluence': '📖 Confluence',
      'microsoft_teams': '💬 Microsoft Teams',
      'microsoft_sharepoint': '📋 SharePoint',
      'document_360': '📚 Document 360',
      'github': '🐙 GitHub',
      'notion': '📝 Notion',
      'airtable': '📊 Airtable'
    };

    return displayNames[appName] || appName;
  }

  // Set up connection tracking (simulates webhook/callback)
  setupConnectionTracking(userId, availableTools) {
    console.log('🔗 Setting up connection tracking for user:', userId);
    console.log('📱 Available tools:', availableTools);

    // In a real implementation, this would:
    // 1. Set up webhook endpoints to receive connection notifications from Pipedream
    // 2. Store pending connection attempts in database
    // 3. Listen for successful authentication callbacks

    // For demo purposes, we'll simulate some connections after a delay
    setTimeout(() => {
      this.simulateSuccessfulConnection(userId, 'google_drive');
    }, 30000); // Simulate Google Drive connection after 30 seconds

    console.log('✅ Connection tracking setup complete');
  }

  // Simulate successful connection (in production, this would be called by webhook)
  simulateSuccessfulConnection(userId, appName) {
    console.log('🎉 Simulating successful connection:', userId, appName);

    // Add the connection to our tracking
    const connectionData = {
      account_id: `acc_${Date.now()}`,
      connected_at: new Date().toISOString(),
      status: 'connected'
    };

    pipedreamService.addUserConnection(userId, appName, connectionData);
    console.log('✅ Connection tracked successfully');

    // In a real implementation, you might also:
    // - Send a Slack notification to the user
    // - Update the user's search preferences
    // - Trigger an initial sync of their data
  }
}

module.exports = new ConnectToolsHandler();

// async handleShowConnections(slackUserId, userEmail) {
//     const { createBackendClient } = require('@pipedream/sdk/server');
//     console.log('📊 Showing connections for user:', slackUserId);

//     try {
//       const pd = createBackendClient({
//         environment: "development", // Change to 'production' in prod
//         credentials: {
//           clientId: process.env.PIPEDREAM_CLIENT_ID,
//           clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
//         },
//         projectId: process.env.PIPEDREAM_PROJECT_ID,
//       });

//       const externalUserId = slackUserId || userEmail;

//       const accounts = await pd.getAccounts({
//         external_user_id: externalUserId,
//         include_credentials: false,
//       });

//       console.log("-----",accounts)

      

//       const hasConnections = 0;

//       if (hasConnections) {
//         return {
//           response_type: 'ephemeral',
//           text: '🔗 Your Connected Tools',
//           attachments: [{
//             color: 'good',
//             title: `✅ Connected Tools (${uniqueApps.length})`,
//             text: 'You have connected the following tools:',
//             fields: uniqueApps.map(app => ({
//               title: this.getToolDisplayName(app),
//             }))
//           }]
//         };
//       } else {
//         return {
//           response_type: 'ephemeral',
//           text: '🔗 Your Connected Tools',
//           attachments: [{
//             color: 'warning',
//             title: '📭 No Connections Found',
//             text: 'You haven\'t connected any tools yet.',
//             actions: [
//               {
//                 type: 'button',
//                 text: '🔗 Connect Tools',
//                 value: 'connect_tools_action',
//                 style: 'primary'
//               }
//             ]
//           }]
//         };
//       }
//     } catch (error) {
//       console.error('❌ Error showing connections:', error.message);
//       return {
//         response_type: 'ephemeral',
//         text: '❌ Error loading your connections. Please try again later.'
//       };
//     }
//   }