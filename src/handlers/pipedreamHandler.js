// Pipedream Integration Handler for Slack Commands
// Handles authentication, connection management, and tool setup

const pipedreamService = require('../services/pipedreamService');

class PipedreamHandler {
  constructor() {
    console.log('🔧 Pipedream Handler initialized');
  }

  // Handle connection command: @Kroolo AI connect pipedream
  async handleConnectCommand(slackUserId, channelId) {
    try {
      console.log('🔗 Processing Pipedream connection request');
      console.log('   Slack User ID:', slackUserId);
      console.log('   Channel ID:', channelId);

      // Always create connect token and show options (simplified approach)
      console.log('🔗 Creating Pipedream Connect token for user:', slackUserId);
      const connectData = await pipedreamService.createConnectToken(slackUserId);

      // Get popular apps for quick connection
      const popularApps = pipedreamService.getPopularApps();

      return {
        response_type: 'ephemeral',
        text: '🔗 Connect your Pipedream account for personalized search',
        attachments: [{
          color: 'good',
          title: 'Pipedream Connect Ready',
          text: 'Connect your Pipedream account to enable:\n• Personalized search results\n• Dynamic tool connections\n• Custom integrations',
          actions: [
            {
              type: 'button',
              text: '🚀 Connect Any App',
              url: connectData.connect_link_url,
              style: 'primary'
            }
          ],
          footer: `🔒 Token expires: ${new Date(connectData.expires_at).toLocaleString()} (${Math.round((new Date(connectData.expires_at) - new Date()) / 1000 / 60)} min)`
        }, {
          color: '#36a64f',
          title: '💡 Quick Connect Options',
          text: 'Popular apps you can connect:',
          fields: popularApps.slice(0, 4).map(app => ({
            title: `${app.icon} ${app.name}`,
            value: `Connect ${app.name} for enhanced search`,
            short: true
          })),
          actions: [
            {
              type: 'button',
              text: '🐙 GitHub',
              url: `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=github`,
              style: 'default'
            },
            {
              type: 'button',
              text: '📝 Notion',
              url: `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=notion`,
              style: 'default'
            },
            {
              type: 'button',
              text: '📊 Airtable',
              url: `https://pipedream.com/_static/connect.html?token=${connectData.token}&connectLink=true&app=airtable`,
              style: 'default'
            }
          ]
        }]
      };

    } catch (error) {
      console.error('❌ Error in Pipedream connect command:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error connecting to Pipedream. Please try again later.',
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Handle disconnect command: @Kroolo AI disconnect pipedream
  async handleDisconnectCommand(slackUserId) {
    try {
      console.log('🔌 Processing Pipedream disconnection request');
      console.log('   Slack User ID:', slackUserId);

      const connectionStatus = pipedreamService.getConnectionStatus(slackUserId);
      
      if (!connectionStatus.connected) {
        return {
          response_type: 'ephemeral',
          text: '⚠️ You are not connected to Pipedream.',
          attachments: [{
            color: 'warning',
            text: 'Use `@Kroolo AI connect pipedream` to connect your account.'
          }]
        };
      }

      // Disconnect the user
      const disconnected = pipedreamService.disconnectUser(slackUserId);

      if (disconnected) {
        return {
          response_type: 'ephemeral',
          text: '✅ Successfully disconnected from Pipedream',
          attachments: [{
            color: 'good',
            text: 'Your personalized search access has been removed. You can reconnect anytime using `@Kroolo AI connect pipedream`.'
          }]
        };
      } else {
        return {
          response_type: 'ephemeral',
          text: '⚠️ You were not connected to Pipedream.',
        };
      }

    } catch (error) {
      console.error('❌ Error handling disconnect command:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error disconnecting from Pipedream. Please try again later.',
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Handle status command: @Kroolo AI pipedream status
  async handleStatusCommand(slackUserId) {
    try {
      console.log('📊 Processing Pipedream status request');
      console.log('   Slack User ID:', slackUserId);

      const connectionStatus = pipedreamService.getConnectionStatus(slackUserId);
      
      if (!connectionStatus.connected) {
        return {
          response_type: 'ephemeral',
          text: '🔗 Pipedream Connection Status',
          attachments: [{
            color: 'warning',
            title: 'Not Connected',
            text: 'You are not connected to Pipedream. Connect your account to enable personalized search.',
            actions: [
              {
                type: 'button',
                text: 'Connect Now',
                name: 'connect_pipedream',
                value: 'connect',
                style: 'primary'
              }
            ]
          }]
        };
      }

      // Get user connections
      let connectionsText = 'Loading connections...';
      try {
        const connections = await pipedreamService.getUserConnections(slackUserId);
        connectionsText = connections.length > 0 
          ? `${connections.length} tool(s) connected`
          : 'No tools connected yet';
      } catch (error) {
        connectionsText = 'Unable to load connections';
      }

      return {
        response_type: 'ephemeral',
        text: '📊 Pipedream Connection Status',
        attachments: [{
          color: 'good',
          title: '✅ Connected',
          fields: [
            {
              title: 'Status',
              value: connectionStatus.message,
              short: false
            },
            {
              title: 'Connected Since',
              value: new Date(connectionStatus.connectedAt).toLocaleString(),
              short: true
            },
            {
              title: 'Tools',
              value: connectionsText,
              short: true
            }
          ],
          actions: [
            {
              type: 'button',
              text: 'Manage Tools',
              name: 'manage_tools',
              value: 'manage',
              style: 'primary'
            },
            {
              type: 'button',
              text: 'Disconnect',
              name: 'disconnect_pipedream',
              value: 'disconnect',
              style: 'danger'
            }
          ]
        }]
      };

    } catch (error) {
      console.error('❌ Error handling status command:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error checking Pipedream status. Please try again later.',
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Handle tools command: @Kroolo AI pipedream tools
  async handleToolsCommand(slackUserId) {
    try {
      console.log('🛠️ Processing Pipedream tools request');
      console.log('   Slack User ID:', slackUserId);

      const connectionStatus = pipedreamService.getConnectionStatus(slackUserId);
      
      if (!connectionStatus.connected) {
        return {
          response_type: 'ephemeral',
          text: '⚠️ You need to connect to Pipedream first.',
          attachments: [{
            color: 'warning',
            text: 'Use `@Kroolo AI connect pipedream` to connect your account and manage tools.'
          }]
        };
      }

      // Get user's connected tools
      const connections = await pipedreamService.getUserConnections(slackUserId);

      if (connections.length === 0) {
        return {
          response_type: 'ephemeral',
          text: '🛠️ No tools connected yet',
          attachments: [{
            color: 'warning',
            title: 'Connect Your Tools',
            text: 'Connect your favorite tools through Pipedream to enable personalized search across all your platforms.',
            actions: [
              {
                type: 'button',
                text: 'Browse Available Tools',
                url: 'https://pipedream.com/apps',
                style: 'primary'
              }
            ]
          }]
        };
      }

      // Format connected tools
      const toolsText = connections.map(conn => 
        `• ${conn.name || conn.app} (${conn.status || 'active'})`
      ).join('\n');

      return {
        response_type: 'ephemeral',
        text: `🛠️ Connected Tools (${connections.length})`,
        attachments: [{
          color: 'good',
          text: toolsText,
          actions: [
            {
              type: 'button',
              text: 'Manage in Pipedream',
              url: 'https://pipedream.com/sources',
              style: 'primary'
            },
            {
              type: 'button',
              text: 'Add More Tools',
              url: 'https://pipedream.com/apps',
              style: 'default'
            }
          ]
        }]
      };

    } catch (error) {
      console.error('❌ Error handling tools command:', error.message);
      return {
        response_type: 'ephemeral',
        text: '❌ Error loading tools. Please try again later.',
        attachments: [{
          color: 'danger',
          text: `Error: ${error.message}`
        }]
      };
    }
  }

  // Parse Pipedream-related commands
  parsePipedreamCommand(query) {
    const queryLower = query.toLowerCase().trim();

    // Disconnect commands (check first to avoid conflict with connect)
    if (queryLower.includes('disconnect pipedream') || queryLower.includes('disconnect from pipedream')) {
      return { command: 'disconnect', action: 'disconnect' };
    }

    // Connection commands
    if (queryLower.includes('connect pipedream') || queryLower.includes('connect to pipedream')) {
      return { command: 'connect', action: 'connect' };
    }
    
    // Status commands
    if (queryLower.includes('pipedream status') || queryLower.includes('connection status')) {
      return { command: 'status', action: 'status' };
    }
    
    // Tools commands
    if (queryLower.includes('pipedream tools') || queryLower.includes('connected tools') || queryLower.includes('manage tools')) {
      return { command: 'tools', action: 'tools' };
    }
    
    return null;
  }
}

module.exports = new PipedreamHandler();
