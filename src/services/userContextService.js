// User Context Service
// Manages user context, connections, and authentication state
// Used by both Pipedream and Slack services

class UserContextService {
  constructor() {
    // In-memory storage for user contexts (in production, use Redis or database)
    this.userContexts = new Map();
    
    console.log('🔧 User Context Service initialized');
  }

  // Store user context information
  storeUserContext(userId, contextData) {
    try {
      console.log('💾 Storing user context for:', userId);
      console.log('   Context data keys:', Object.keys(contextData));

      // Get existing context or create new one
      const existingContext = this.userContexts.get(userId) || {};
      
      // Merge with existing context
      const updatedContext = {
        ...existingContext,
        ...contextData,
        lastUpdated: new Date().toISOString(),
        userId: userId
      };

      this.userContexts.set(userId, updatedContext);
      
      console.log('✅ User context stored successfully');
      return updatedContext;
    } catch (error) {
      console.error('❌ Error storing user context:', error.message);
      return null;
    }
  }

  // Get user context
  getUserContext(userId) {
    try {
      const context = this.userContexts.get(userId);
      
      if (context) {
        console.log('✅ User context retrieved for:', userId);
        return context;
      } else {
        console.log('⚠️ No context found for user:', userId);
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting user context:', error.message);
      return null;
    }
  }

  // Get user connection summary
  getUserConnectionSummary(userId) {
    try {
      const context = this.getUserContext(userId);
      
      if (!context) {
        return {
          userId,
          connected: false,
          connections: [],
          totalConnections: 0
        };
      }

      const connections = [];
      let totalConnections = 0;

      // Check Pipedream connections
      if (context.pipedreamConnected) {
        connections.push({
          service: 'pipedream',
          status: context.connectionStatus || 'connected',
          email: context.pipedreamEmail,
          name: context.pipedreamName,
          userId: context.pipedreamUserId
        });
        totalConnections++;
      }

      // Check Slack connections
      if (context.slackConnected) {
        connections.push({
          service: 'slack',
          status: context.connectionStatus || 'connected',
          email: context.connectedSlackEmail,
          name: context.connectedSlackName,
          teamId: context.connectedTeamId,
          teamName: context.connectedTeamName,
          scopes: context.connectedScopes
        });
        totalConnections++;
      }

      // Check connected tools
      if (context.connectedTools && Array.isArray(context.connectedTools)) {
        totalConnections += context.connectedTools.length;
      }

      return {
        userId,
        connected: totalConnections > 0,
        connections,
        totalConnections,
        connectedTools: context.connectedTools || [],
        lastUpdated: context.lastUpdated
      };
    } catch (error) {
      console.error('❌ Error getting user connection summary:', error.message);
      return {
        userId,
        connected: false,
        connections: [],
        totalConnections: 0,
        error: error.message
      };
    }
  }

  // Update connected tools for a user
  updateConnectedTools(userId, toolInfo) {
    try {
      console.log('🔧 Updating connected tools for user:', userId);
      console.log('   Tool info:', toolInfo);

      const context = this.getUserContext(userId) || {};
      const connectedTools = context.connectedTools || [];
      
      // Check if tool already exists
      const existingToolIndex = connectedTools.findIndex(
        tool => tool.name === toolInfo.name || tool.app_id === toolInfo.app_id
      );
      
      if (existingToolIndex >= 0) {
        // Update existing tool
        connectedTools[existingToolIndex] = {
          ...connectedTools[existingToolIndex],
          ...toolInfo,
          lastConnected: new Date().toISOString()
        };
        console.log('🔄 Updated existing tool connection');
      } else {
        // Add new tool
        connectedTools.push({
          ...toolInfo,
          connectedAt: new Date().toISOString(),
          lastConnected: new Date().toISOString(),
          status: 'connected'
        });
        console.log('➕ Added new tool connection');
      }
      
      return this.storeUserContext(userId, {
        ...context,
        connectedTools,
        connectionStatus: 'connected',
        totalConnectedTools: connectedTools.length
      });
    } catch (error) {
      console.error('❌ Error updating connected tools:', error.message);
      return null;
    }
  }

  // Remove a connected tool
  removeConnectedTool(userId, toolIdentifier) {
    try {
      console.log('🗑️ Removing connected tool for user:', userId);
      console.log('   Tool identifier:', toolIdentifier);

      const context = this.getUserContext(userId) || {};
      const connectedTools = context.connectedTools || [];
      
      // Filter out the tool
      const updatedTools = connectedTools.filter(
        tool => tool.name !== toolIdentifier && 
                tool.app_id !== toolIdentifier &&
                tool.id !== toolIdentifier
      );
      
      console.log(`🗑️ Removed tool. Tools count: ${connectedTools.length} → ${updatedTools.length}`);
      
      return this.storeUserContext(userId, {
        ...context,
        connectedTools: updatedTools,
        totalConnectedTools: updatedTools.length
      });
    } catch (error) {
      console.error('❌ Error removing connected tool:', error.message);
      return null;
    }
  }

  // Clear all user context
  clearUserContext(userId) {
    try {
      console.log('🧹 Clearing user context for:', userId);
      
      const removed = this.userContexts.delete(userId);
      
      if (removed) {
        console.log('✅ User context cleared successfully');
      } else {
        console.log('⚠️ No context found to clear');
      }
      
      return removed;
    } catch (error) {
      console.error('❌ Error clearing user context:', error.message);
      return false;
    }
  }

  // Get all users with context (for admin/debugging)
  getAllUserContexts() {
    try {
      const allContexts = {};
      
      for (const [userId, context] of this.userContexts.entries()) {
        allContexts[userId] = {
          ...context,
          // Remove sensitive information
          pipedreamEmail: context.pipedreamEmail ? '***@***.com' : null,
          connectedSlackEmail: context.connectedSlackEmail ? '***@***.com' : null
        };
      }
      
      return allContexts;
    } catch (error) {
      console.error('❌ Error getting all user contexts:', error.message);
      return {};
    }
  }

  // Get context statistics
  getContextStats() {
    try {
      const totalUsers = this.userContexts.size;
      let pipedreamConnected = 0;
      let slackConnected = 0;
      let totalTools = 0;

      for (const [userId, context] of this.userContexts.entries()) {
        if (context.pipedreamConnected) pipedreamConnected++;
        if (context.slackConnected) slackConnected++;
        if (context.connectedTools) totalTools += context.connectedTools.length;
      }

      return {
        totalUsers,
        pipedreamConnected,
        slackConnected,
        totalTools,
        averageToolsPerUser: totalUsers > 0 ? (totalTools / totalUsers).toFixed(2) : 0
      };
    } catch (error) {
      console.error('❌ Error getting context stats:', error.message);
      return {
        totalUsers: 0,
        pipedreamConnected: 0,
        slackConnected: 0,
        totalTools: 0,
        averageToolsPerUser: 0,
        error: error.message
      };
    }
  }
}

module.exports = new UserContextService();
