// Slack Integration Handler – *plain-text* responses only
// NOTE: all business logic and service-calls remain unchanged.
const slackService        = require('../services/slackService');
const userContextService  = require('../services/userContextService');

class SlackHandler {
  constructor() {
    console.log('🔧 Slack Handler initialised');
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
      'airtable': '📊 Airtable',
      'slack': '💬 Slack',
      'zendesk': '🎧 Zendesk'
    };

    return displayNames[appName] || appName;
  }

  /* ───────────────────────────── CONNECT ───────────────────────────── */
  async handleConnectCommand(slackUserId, userContext = null) {
    try {
      console.log('🔗 Processing Slack connect command for user:', slackUserId);

      const status = slackService.getConnectionStatus(slackUserId);

      /* Already connected → tell the user and give simple tips */
      if (status.connected) {
        const scopes = status.scopes?.join(', ') || 'None';
        return {
          response_type: 'ephemeral',
          text:
            `✅ You already connected your Slack apps!\n\n` +
            `• Team : *${status.teamName || 'Unknown'}*\n` +
            `• Connected : ${new Date(status.connectedAt).toLocaleString()}\n` +
            `• Scopes : ${scopes}\n\n` +
            `👉 To disconnect run */disconnect slack*  – to manage apps run */slack apps*`
        };
      }

      /* Not connected yet → send OAuth link & quick-connect URLs */
      const authUrl      = slackService.generateAuthURL(slackUserId, null, userContext);
      const popularApps  = slackService.getPopularSlackApps().slice(0, 3);

      let quickLinks = popularApps
        .map(a => `• ${a.icon} *${a.name}*: <${slackService.createAppAuthURL(slackUserId, a.app_id, userContext)}|Connect>`)
        .join('\n');

      return {
        response_type: 'ephemeral',
        text:
          `🔗 *Connect your Slack workspace apps*\n` +
          `Click to authorise: <${authUrl}|Connect Slack Apps>\n\n` +
          `Popular quick-connect options:\n${quickLinks}\n\n` +
          `🔒 Uses secure OAuth 2.0`
      };

    } catch (err) {
      console.error('❌ Slack connect error:', err);
      return {
        response_type: 'ephemeral',
        text: `❌ Error connecting Slack apps: ${err.message}`
      };
    }
  }

  /* ───────────────────────────── STATUS ───────────────────────────── */
  async handleStatusCommand(slackUserId) {
    try {
      console.log('📊 Getting Slack status for', slackUserId);

      const status          = slackService.getConnectionStatus(slackUserId);
      const userConnections = slackService.getUserConnections(slackUserId);

      if (!status.connected) {
        return {
          response_type: 'ephemeral',
          text:
            `🔗 *Slack Apps Status*: _Not Connected_\n` +
            `Run */connect slack* to link your workspace apps.`
        };
      }

      return {
        response_type: 'ephemeral',
        text:
          `✅ *Slack Apps Status*: Connected\n\n` +
          `• Team : *${status.teamName || 'Unknown'}*\n` +
          `• Connected apps : ${userConnections.length}\n` +
          `• Since : ${new Date(status.connectedAt).toLocaleString()}\n` +
          `• Scopes : ${status.scopes?.join(', ') || 'None'}\n\n` +
          `👉  */slack apps*  to manage or */disconnect slack* to unlink`
      };

    } catch (err) {
      console.error('❌ Slack status error:', err);
      return {
        response_type: 'ephemeral',
        text: `❌ Error getting Slack status: ${err.message}`
      };
    }
  }

  /* ─────────────────────────── DISCONNECT ─────────────────────────── */
  async handleDisconnectCommand(slackUserId) {
    try {
      console.log('🔌 Disconnecting Slack apps for', slackUserId);

      const wasConnected = slackService.disconnectUser(slackUserId);

      if (wasConnected) {
        // Update cached user context
        userContextService.storeUserContext(slackUserId, {
          slackConnected: false,
          connectionStatus: 'disconnected'
        });

        return {
          response_type: 'ephemeral',
          text:
            `✅ Successfully disconnected all Slack apps.\n` +
            `You can reconnect any time with */connect slack*`
        };
      }

      return {
        response_type: 'ephemeral',
        text:
          `⚠️ No active Slack app connection found.\n` +
          `Run */connect slack* to link your workspace apps.`
      };

    } catch (err) {
      console.error('❌ Slack disconnect error:', err);
      return {
        response_type: 'ephemeral',
        text: `❌ Error disconnecting Slack apps: ${err.message}`
      };
    }
  }

  /* ─────────────────────────── DISCONNECT TOOL ─────────────────────────── */
  async handleDisconnectToolCommand(slackUserId, toolType) {
    try {
      console.log('🔌 Disconnecting specific tool for user:', slackUserId, 'tool:', toolType);

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

      // Get user connections from database
      const databaseService = require('../services/databaseService');
      const userConnections = await databaseService.getUserConnections(slackUserId);
      
      // Check if the tool exists in user connections
      if (!userConnections.appNames.includes(toolType)) {
        return {
          response_type: 'ephemeral',
          text: `⚠️ You don't have ${toolType} connected.`,
          attachments: [{
            color: 'warning',
            text: 'Use `@Kroolo AI connect` to see available tools to connect.'
          }]
        };
      }

      // Find the account ID for the tool
      const toolIndex = userConnections.appNames.indexOf(toolType);
      const accountId = userConnections.accountIds[toolIndex];

      // Call the Pipedream API to disconnect the tool
      const pipedreamService = require('../services/pipedreamService');
      const result = await pipedreamService.removeUserConnection(slackUserId, toolType);

      if (result.success) {
        // Update the database to remove the connection
        const disconnected = await databaseService.disconnectUserConnection(slackUserId, toolType);
        console.log('Database disconnection result:', disconnected ? 'Success' : 'Failed');

        // Update user context
        const userContextService = require('../services/userContextService');
        const updatedContext = userContextService.removeConnectedTool(slackUserId, toolType);
        console.log('User context updated:', updatedContext ? 'Success' : 'Failed');

        return {
          response_type: 'ephemeral',
          text: '✅ Tool Disconnected Successfully',
          attachments: [{
            color: 'good',
            title: `🗑️ ${this.getToolDisplayName(toolType)} Disconnected`,
            text: result.message,
            fields: [
              {
                title: '📊 Remaining Connections',
                value: `${result.remainingConnections} tools still connected`,
                short: true
              },
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
                value: toolType,
                name: 'connect_tool',
                style: 'primary'
              },
              {
                type: 'button',
                text: '📊 View All Connections',
                value: 'show_connections',
                name: 'show_connections',
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
            text: result.message || 'An error occurred while disconnecting the tool.',
            actions: [
              {
                type: 'button',
                text: '🔄 Try Again',
                value: toolType,
                name: 'disconnect_tool',
                style: 'default'
              }
            ]
          }]
        };
      }

    } catch (err) {
      console.error('❌ Tool disconnect error:', err);
      return {
        response_type: 'ephemeral',
        text: `❌ Error disconnecting tool: ${err.message}`
      };
    }
  }

  /* ─────────────────────────── MANAGE APPS ────────────────────────── */
  async handleManageAppsCommand(slackUserId) {
    try {
      console.log('🛠  Managing Slack apps for', slackUserId);

      const popularApps     = slackService.getPopularSlackApps();
      const userConnections = slackService.getUserConnections(slackUserId);

      const available = popularApps
        .map(a => `• ${a.icon} *${a.name}*: <${slackService.createAppAuthURL(slackUserId, a.app_id)}|Connect>`)
        .join('\n');

      const connected = userConnections.length
        ? userConnections.map(c =>
            `• ${c.app_id || 'Unknown App'} (connected ${new Date(c.connected_at).toLocaleDateString()})`
          ).join('\n')
        : '_None yet_';

      return {
        response_type: 'ephemeral',
        text:
          `🛠 *Manage Slack App Connections*\n\n` +
          `*Available apps to connect*\n${available}\n\n` +
          `*Currently connected apps*\n${connected}`
      };

    } catch (err) {
      console.error('❌ Slack manage-apps error:', err);
      return {
        response_type: 'ephemeral',
        text: `❌ Error managing Slack apps: ${err.message}`
      };
    }
  }
}

module.exports = new SlackHandler();
