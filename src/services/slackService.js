// Slack Authentication Service
// Handles Slack app connections, OAuth flows, and token management
// Similar to Pipedream service but for Slack-specific app connections

const axios = require('axios');
const crypto = require('crypto');
const userContextService = require('./userContextService');

class SlackService {
  constructor() {
    // Slack OAuth configuration
    this.clientId = process.env.SLACK_CLIENT_ID;
    this.clientSecret = process.env.SLACK_CLIENT_SECRET;
    this.botToken = process.env.SLACK_BOT_TOKEN;
    
    // User sessions and connections storage
    this.userSessions = new Map();
    this.userConnections = new Map();
    this.authStates = new Map();
    
    console.log('🔧 Slack Service initialized');
    console.log('   Client ID:', this.clientId ? '✅ Set' : '❌ Missing');
    console.log('   Client Secret:', this.clientSecret ? '✅ Set' : '❌ Missing');
    console.log('   Bot Token:', this.botToken ? '✅ Set' : '❌ Missing');
  }

  // Generate secure state for OAuth flow
  generateState(slackUserId, userContext = null) {
    const state = crypto.randomBytes(32).toString('hex');
    const session = {
      slackUserId,
      userContext,
      createdAt: Date.now(),
      expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes
    };
    
    this.authStates.set(state, session);
    console.log('🔐 Generated OAuth state for user:', slackUserId);
    return state;
  }

  // Get popular Slack apps that users can connect
  getPopularSlackApps() {
    return [
      {
        name: 'Slack Workspace',
        icon: '💬',
        description: 'Connect your Slack workspace for enhanced search',
        app_id: 'slack_workspace',
        scopes: ['channels:read', 'users:read', 'files:read', 'search:read']
      },
      {
        name: 'Slack Files',
        icon: '📁',
        description: 'Access and search your Slack files',
        app_id: 'slack_files',
        scopes: ['files:read', 'files:write']
      },
      {
        name: 'Slack Channels',
        icon: '📢',
        description: 'Search across your Slack channels',
        app_id: 'slack_channels',
        scopes: ['channels:read', 'channels:history', 'groups:read', 'groups:history']
      },
      {
        name: 'Slack Messages',
        icon: '💬',
        description: 'Search your Slack message history',
        app_id: 'slack_messages',
        scopes: ['search:read', 'channels:history', 'groups:history', 'im:history']
      },
      {
        name: 'Slack Apps',
        icon: '🔧',
        description: 'Connect to Slack app integrations',
        app_id: 'slack_apps',
        scopes: ['apps:read']
      },
      {
        name: 'Slack Notifications',
        icon: '🔔',
        description: 'Manage Slack notifications and alerts',
        app_id: 'slack_notifications',
        scopes: ['chat:write', 'chat:write.public']
      }
    ];
  }

  // Generate OAuth URL for Slack app authentication
  generateAuthURL(slackUserId, appId = null, userContext = null) {
    const state = this.generateState(slackUserId, userContext);
    const redirectUri = `${process.env.SLACK_BOT_URL || 'http://localhost:3000'}/auth/slack/callback`;
    
    // Get scopes based on app or use default comprehensive scopes
    let scopes = 'channels:read,users:read,files:read,search:read,channels:history,groups:read,groups:history,im:history,chat:write';
    
    if (appId) {
      const app = this.getPopularSlackApps().find(a => a.app_id === appId);
      if (app) {
        scopes = app.scopes.join(',');
      }
    }

    const authUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `state=${state}&` +
      `scope=${encodeURIComponent(scopes)}` +
      (appId ? `&app_id=${appId}` : '');

    console.log('🔗 Generated Slack Auth URL for user:', slackUserId);
    console.log('   App ID:', appId || 'General');
    console.log('   Scopes:', scopes);
    return authUrl;
  }

  // Create app-specific auth URL
  createAppAuthURL(slackUserId, appId, userContext = null) {
    return this.generateAuthURL(slackUserId, appId, userContext);
  }

  // Check if user is authenticated
  getUserAuth(slackUserId) {
    const userAuth = this.userSessions.get(slackUserId);
    
    if (!userAuth) {
      return {
        authenticated: false,
        userAuth: null
      };
    }

    return {
      authenticated: true,
      userAuth: userAuth
    };
  }

  // Get connection status for Slack display
  getConnectionStatus(slackUserId) {
    const authStatus = this.getUserAuth(slackUserId);
    
    if (!authStatus.authenticated) {
      return {
        connected: false,
        message: "🔗 Not connected to Slack apps",
        action: "Connect your Slack apps to access enhanced features"
      };
    }

    return {
      connected: true,
      message: `✅ Connected as ${authStatus.userAuth.name} (${authStatus.userAuth.email})`,
      connectedAt: authStatus.userAuth.connectedAt,
      teamName: authStatus.userAuth.teamName,
      scopes: authStatus.userAuth.scopes
    };
  }

  // Store user connection after successful auth
  async storeUserConnection(slackUserId, connectionData) {
    try {
      console.log('💾 Storing Slack user connection:');
      console.log('   User:', slackUserId);
      console.log('   Connection:', connectionData);

      // Initialize user connections if not exists
      if (!this.userConnections) {
        this.userConnections = new Map();
      }

      // Store connection details
      const connection = {
        ...connectionData,
        connected_at: new Date().toISOString(),
        status: 'active'
      };

      // Get existing connections for user
      const existingConnections = this.userConnections.get(slackUserId) || [];
      
      // Check if connection already exists
      const existingIndex = existingConnections.findIndex(
        conn => conn.app_id === connectionData.app_id
      );

      if (existingIndex >= 0) {
        // Update existing connection
        existingConnections[existingIndex] = connection;
        console.log('🔄 Updated existing Slack connection');
      } else {
        // Add new connection
        existingConnections.push(connection);
        console.log('➕ Added new Slack connection');
      }

      this.userConnections.set(slackUserId, existingConnections);

      console.log(`📊 User ${slackUserId} now has ${existingConnections.length} Slack connection(s)`);

      return connection;
    } catch (error) {
      console.error('❌ Error storing Slack user connection:', error.message);
      throw error;
    }
  }

  // Get user's connections
  getUserConnections(slackUserId) {
    if (!this.userConnections) {
      return [];
    }
    return this.userConnections.get(slackUserId) || [];
  }

  // Disconnect user
  disconnectUser(slackUserId) {
    const removed = this.userSessions.delete(slackUserId);
    console.log(removed ? '✅ Slack user disconnected' : '⚠️ Slack user was not connected');
    return removed;
  }

  // Handle OAuth callback
  async handleAuthCallback(code, state) {
    try {
      console.log('🔄 Processing Slack OAuth callback');
      console.log('   Code:', code ? '✅ Present' : '❌ Missing');
      console.log('   State:', state ? '✅ Present' : '❌ Missing');

      // Validate state
      const session = this.authStates.get(state);
      if (!session) {
        throw new Error('Invalid or expired state parameter');
      }

      // Check if state has expired
      if (Date.now() > session.expiresAt) {
        this.authStates.delete(state);
        throw new Error('Authentication session expired');
      }

      console.log('✅ State validation passed for user:', session.slackUserId);

      // Exchange code for access token
      const tokenUrl = 'https://slack.com/api/oauth.v2.access';
      const redirectUri = `${process.env.SLACK_BOT_URL || 'http://localhost:3000'}/auth/slack/callback`;

      const tokenResponse = await axios.post(tokenUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!tokenResponse.data.ok) {
        throw new Error(`Slack OAuth error: ${tokenResponse.data.error}`);
      }

      const { access_token, team, authed_user, scope } = tokenResponse.data;

      // Get user information from Slack
      const userResponse = await axios.get('https://slack.com/api/users.info', {
        headers: {
          'Authorization': `Bearer ${access_token}`
        },
        params: {
          user: authed_user.id
        }
      });

      if (!userResponse.data.ok) {
        throw new Error(`Failed to get user info: ${userResponse.data.error}`);
      }

      const userData = userResponse.data.user;

      // Store user authentication data
      const userAuth = {
        slackUserId: session.slackUserId,
        connectedSlackUserId: authed_user.id,
        email: userData.profile?.email || authed_user.email,
        name: userData.real_name || userData.name,
        teamId: team.id,
        teamName: team.name,
        accessToken: access_token,
        scopes: scope.split(','),
        connectedAt: new Date().toISOString(),
        status: 'authenticated'
      };

      this.userSessions.set(session.slackUserId, userAuth);
      this.authStates.delete(state); // Clean up state

      // Store user context with Slack connection info
      userContextService.storeUserContext(session.slackUserId, {
        slackConnected: true,
        connectedSlackUserId: authed_user.id,
        connectedSlackEmail: userData.profile?.email || authed_user.email,
        connectedSlackName: userData.real_name || userData.name,
        connectedTeamId: team.id,
        connectedTeamName: team.name,
        connectionStatus: 'connected',
        connectedScopes: scope.split(',')
      });

      console.log('✅ Slack user authenticated successfully');
      console.log('   Original Slack User ID:', session.slackUserId);
      console.log('   Connected Slack User ID:', authed_user.id);
      console.log('   Email:', userData.profile?.email || authed_user.email);
      console.log('   Team:', team.name);

      return userAuth;

    } catch (error) {
      console.error('❌ Slack OAuth error:', error.message);
      throw error;
    }
  }

  // Get dynamic credentials for API calls (similar to Pipedream)
  async getDynamicCredentials(slackUserId, slackEmail = null) {
    try {
      console.log('🔍 Getting dynamic Slack credentials for user:', slackUserId);

      const userAuth = this.getUserAuth(slackUserId);

      if (userAuth.authenticated) {
        console.log('✅ Using authenticated Slack user credentials');

        return {
          slack_user_id: slackUserId,
          connected_slack_user_id: userAuth.userAuth.connectedSlackUserId,
          user_email: userAuth.userAuth.email,
          team_id: userAuth.userAuth.teamId,
          team_name: userAuth.userAuth.teamName,
          access_token: userAuth.userAuth.accessToken,
          scopes: userAuth.userAuth.scopes,
          dynamic: true,
          email_source: 'slack_auth'
        };
      }
    } catch (error) {
      console.error('⚠️ Error getting dynamic Slack credentials:', error.message);
    }

    // Return basic credentials as fallback
    const emailToUse = slackEmail || "default@slack.com";
    console.log('⚠️ Using basic Slack credentials as fallback');
    console.log('   📧 Email used:', emailToUse);
    console.log('   📧 Source:', slackEmail ? 'Slack Profile' : 'Static Fallback');

    return {
      slack_user_id: slackUserId,
      user_email: emailToUse,
      access_token: this.botToken,
      dynamic: false,
      email_source: slackEmail ? 'slack_profile' : 'static_fallback'
    };
  }
}

module.exports = new SlackService();
