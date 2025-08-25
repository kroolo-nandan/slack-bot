// Tools Management Routes
// API endpoints for fetching user's connected tools and generating dynamic payloads

const express = require('express');
const router = express.Router();
const databaseService = require('../services/databaseService');

// Get all connected tools for a user (supports multiple identifier types)
router.get('/user/:userId/tools', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('🔍 API: Getting all connected tools for user:', userId);
    console.log('   🔍 Identifier type detection...');

    // Universal user lookup
    const userLookup = await databaseService.getUserByAnyIdentifier(userId);

    if (!userLookup.user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        identifier: userId,
        tried_methods: ['slack_id', 'email', 'mongo_id', 'external_id'],
        timestamp: new Date().toISOString()
      });
    }

    const { user, found_by } = userLookup;
    console.log('✅ User found by:', found_by);

    // Use Slack User ID for tool lookup (primary identifier)
    const toolsSummary = await databaseService.getAllConnectedTools(user.slackUserId);

    // Add user identification info to response
    toolsSummary.user_identification = {
      mongo_id: user._id,
      slack_user_id: user.slackUserId,
      external_user_id: user.externalUserId,
      primary_email: user.primaryEmail,
      found_by: found_by,
      lookup_identifier: userId
    };

    console.log('✅ API: Connected tools retrieved successfully');
    console.log('   📊 Total tools:', toolsSummary.total_tools);
    console.log('   ✅ Active tools:', toolsSummary.active_tools);
    console.log('   🔍 Found by:', found_by);

    res.json({
      success: true,
      user_id: userId,
      user_identification: toolsSummary.user_identification,
      data: toolsSummary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ API: Error getting connected tools:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get connected tools',
      message: error.message,
      identifier: req.params.userId,
      timestamp: new Date().toISOString()
    });
  }
});

// Get connection count for a user
router.get('/user/:userId/count', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('🔍 API: Getting connection count for user:', userId);
    
    const connectionCount = await databaseService.getConnectionCount(userId);
    
    console.log('✅ API: Connection count retrieved successfully');
    console.log('   📊 Total connections:', connectionCount.total_connections);
    
    res.json({
      success: true,
      data: connectionCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ API: Error getting connection count:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get connection count',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get dynamic credentials for API calls (enhanced with multiple identifiers)
router.get('/user/:userId/credentials', async (req, res) => {
  try {
    const { userId } = req.params;
    const { fallback_email } = req.query;

    console.log('🔍 API: Getting dynamic credentials for user:', userId);

    // Universal user lookup first
    const userLookup = await databaseService.getUserByAnyIdentifier(userId);

    if (!userLookup.user) {
      return res.status(404).json({
        success: false,
        error: 'User not found for credentials generation',
        identifier: userId,
        timestamp: new Date().toISOString()
      });
    }

    const { user, found_by } = userLookup;
    console.log('✅ User found by:', found_by);

    // Generate credentials using Slack User ID (primary)
    const credentials = await databaseService.getDynamicCredentials(user.slackUserId, fallback_email);

    // Enhanced credentials with all identifiers
    const enhancedCredentials = {
      ...credentials,

      // Multiple user identifiers for API flexibility
      user_identifiers: {
        mongo_id: user._id.toString(),
        slack_user_id: user.slackUserId,
        external_user_id: user.externalUserId,
        primary_email: user.primaryEmail,
        slack_email: user.slackEmail,
        pipedream_email: user.pipedreamEmail
      },

      // API call options
      api_call_options: {
        // Option 1: Use Slack User ID (recommended)
        slack_user_id: user.slackUserId,

        // Option 2: Use MongoDB ID
        mongo_id: user._id.toString(),

        // Option 3: Use Email
        user_email: user.primaryEmail,

        // Option 4: Use External ID
        external_user_id: user.externalUserId
      },

      // Lookup metadata
      lookup_info: {
        found_by: found_by,
        lookup_identifier: userId,
        lookup_timestamp: new Date().toISOString()
      }
    };

    console.log('✅ API: Enhanced dynamic credentials generated successfully');
    console.log('   🔗 Account IDs:', credentials.account_ids.length);
    console.log('   📱 Connected apps:', credentials.connected_apps.length);
    console.log('   🔍 Found by:', found_by);
    console.log('   🆔 MongoDB ID:', user._id.toString());
    console.log('   👤 Slack ID:', user.slackUserId);
    console.log('   📧 Email:', user.primaryEmail);

    res.json({
      success: true,
      user_id: userId,
      credentials: enhancedCredentials,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ API: Error getting dynamic credentials:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get dynamic credentials',
      message: error.message,
      identifier: req.params.userId,
      timestamp: new Date().toISOString()
    });
  }
});

// Generate dynamic API payload for search
router.post('/user/:userId/api-payload', async (req, res) => {
  try {
    const { userId } = req.params;
    const { query, limit = 10, apps_filter = [] } = req.body;
    
    console.log('🔍 API: Generating dynamic API payload for user:', userId);
    console.log('   🔍 Query:', query);
    console.log('   📱 Apps filter:', apps_filter);
    
    const credentials = await databaseService.getDynamicCredentials(userId);
    
    // Filter apps if specified
    let targetApps = credentials.connected_apps;
    if (apps_filter.length > 0) {
      targetApps = credentials.connected_apps.filter(app => apps_filter.includes(app));
    }
    
    // Generate dynamic API payload
    const apiPayload = {
      query: query,
      account_ids: credentials.account_ids,
      external_user_id: credentials.external_user_id,
      user_email: credentials.user_email,
      apps: targetApps,
      limit: limit,
      
      // Additional context from connected tools
      app_categories: credentials.app_categories,
      total_connections: credentials.total_connections,
      connection_quality: credentials.source,
      
      // Metadata
      generated_at: new Date().toISOString(),
      user_context: {
        has_connections: credentials.total_connections > 0,
        connection_source: credentials.source,
        active_connections: credentials.active_connections
      }
    };
    
    console.log('✅ API: Dynamic payload generated successfully');
    console.log('   🔗 Account IDs:', apiPayload.account_ids.length);
    console.log('   📱 Target apps:', apiPayload.apps.length);
    console.log('   🏷️ Categories:', apiPayload.app_categories.length);
    
    res.json({
      success: true,
      user_id: userId,
      api_payload: apiPayload,
      connection_summary: {
        total_tools: credentials.total_connections,
        active_tools: credentials.active_connections,
        connected_apps: credentials.connected_apps,
        account_ids: credentials.account_ids
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ API: Error generating dynamic API payload:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate dynamic API payload',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get user status with all connection details
router.get('/user/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('🔍 API: Getting user status for:', userId);
    
    const userStatus = await databaseService.getUserStatus(userId);
    
    if (!userStatus.found) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        user_id: userId,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('✅ API: User status retrieved successfully');
    console.log('   📊 Total connections:', userStatus.summary.totalConnections);
    
    res.json({
      success: true,
      user_id: userId,
      status: userStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ API: Error getting user status:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get user status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Disconnect a specific tool for a user
router.delete('/user/:userId/tools/:appName', async (req, res) => {
  try {
    const { userId, appName } = req.params;
    
    console.log('🔌 API: Disconnecting tool for user:', userId, 'app:', appName);
    
    const result = await databaseService.disconnectUserConnection(userId, appName);
    
    if (result) {
      console.log('✅ API: Tool disconnected successfully');
      res.json({
        success: true,
        message: `Tool ${appName} disconnected successfully`,
        user_id: userId,
        app_name: appName,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Connection not found',
        user_id: userId,
        app_name: appName,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ API: Error disconnecting tool:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect tool',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get global statistics
router.get('/stats/global', async (req, res) => {
  try {
    console.log('🔍 API: Getting global statistics');
    
    const globalStats = await databaseService.getGlobalStats();
    
    console.log('✅ API: Global statistics retrieved successfully');
    
    res.json({
      success: true,
      stats: globalStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ API: Error getting global statistics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get global statistics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
