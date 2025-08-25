// Simulate Webhook Processing and Data Storage
// This script simulates your exact webhook and shows the stored data

require('dotenv').config();

// Your exact webhook data
const webhookData = {
  "event": "CONNECTION_SUCCESS",
  "connect_token": "ctok_54f5811dd3380ff68d5d3fabaeec02cc",
  "environment": "development",
  "connect_session_id": 1749939654775046100,
  "account": {
    "id": "apn_JjhljkO",
    "name": "amar.kumar@kroolo.com",
    "external_id": "U0970GHE7PX",
    "healthy": true,
    "dead": null,
    "app": {
      "id": "oa_G7AiAg",
      "name_slug": "google_drive",
      "name": "Google Drive",
      "auth_type": "oauth",
      "description": "Google Drive is a file storage and synchronization service which allows you to create and share your work online, and access your documents from anywhere.",
      "img_src": "https://assets.pipedream.net/s.v0/app_1lxhk1/logo/orig",
      "custom_fields_json": "[]",
      "categories": ["File Storage"],
      "featured_weight": 1000000096,
      "connect": {
        "allowed_domains": ["www.googleapis.com", "drive.googleapis.com"],
        "base_proxy_target_url": "https://www.googleapis.com",
        "proxy_enabled": true
      }
    },
    "created_at": "2025-07-26T12:21:48.000Z",
    "updated_at": "2025-07-26T12:21:48.000Z"
  }
};

async function simulateWebhookProcessing() {
  console.log('🎯 ===== SIMULATING WEBHOOK PROCESSING =====');
  console.log('📥 Processing your exact webhook data...');

  try {
    // Extract data exactly like your webhook handler
    const { account, event } = webhookData;
    const userId = account?.external_id || account?.name;
    const accountId = account?.id;
    const appName = account?.app?.name_slug;
    const appDisplayName = account?.app?.name;
    const accountEmail = account?.name || account?.external_id;
    const categories = account?.app?.categories;

    console.log('\n🧩 Extracted Essential Data:');
    console.log('   🔗 Account ID:', accountId);
    console.log('   📱 App Name:', appName);
    console.log('   📱 App Display Name:', appDisplayName);
    console.log('   👤 User ID (Slack):', userId);
    console.log('   📧 Account Email:', accountEmail);
    console.log('   🎯 Event Type:', event);
    console.log('   🏷️ App Categories:', categories);

    // Store in Pipedream service (in-memory)
    console.log('\n💾 Storing in Pipedream service...');
    const pipedreamService = require('./src/services/pipedreamService');
    
    const storeResult = await pipedreamService.storeRealConnection(
      userId,
      appName,
      accountId,
      accountEmail
    );

    if (storeResult.success) {
      console.log('✅ Data stored successfully!');
      console.log('   🔗 Real App ID stored:', accountId);
      console.log('   📱 App:', appName);
      console.log('   👤 User:', userId);
      console.log('   📧 Email:', accountEmail);
    }

    // Now test retrieving the data for API calls
    console.log('\n🔍 Testing data retrieval for API calls...');
    
    // Get user connections
    const userConnections = pipedreamService.getUserConnections(userId);
    console.log('📊 User connections:', userConnections);

    // Get connection status
    const connectionStatus = pipedreamService.getConnectionStatus(userId);
    console.log('📊 Connection status:', connectionStatus);

    // Get dynamic credentials
    console.log('\n🔍 Getting dynamic credentials...');
    const credentials = await pipedreamService.getDynamicCredentials(userId, accountEmail);
    
    console.log('✅ Dynamic credentials:');
    console.log('   External User ID:', credentials.external_user_id);
    console.log('   User Email:', credentials.user_email);
    console.log('   Account IDs:', credentials.account_ids);
    console.log('   Dynamic:', credentials.dynamic);
    console.log('   Auth Source:', credentials.auth_source);

    // Generate API payload
    console.log('\n📋 Generating API payload...');
    const apiPayload = {
      query: "find my Google Drive files",
      user_identification: {
        slack_user_id: userId,
        external_user_id: credentials.external_user_id,
        email: credentials.user_email
      },
      account_ids: credentials.account_ids,
      search_scope: credentials.account_ids.length > 0 ? 'connected_tools' : 'default',
      personalized: credentials.account_ids.length > 0,
      timestamp: new Date().toISOString()
    };

    console.log('✅ API Payload:');
    console.log(JSON.stringify(apiPayload, null, 2));

    // Show what should happen vs what is happening
    console.log('\n📊 Data Analysis:');
    console.log('=====================================');
    console.log('✅ What is working:');
    console.log('   - Webhook data extraction');
    console.log('   - In-memory storage');
    console.log('   - Data retrieval');
    console.log('   - API payload generation');
    
    console.log('\n⚠️ What needs fixing:');
    console.log('   - MongoDB connection (IP whitelist issue)');
    console.log('   - Real account IDs not being used in API calls');
    
    console.log('\n🎯 Expected vs Actual:');
    console.log('Expected Account ID in API:', accountId, '(from webhook)');
    console.log('Actual Account IDs in API:', credentials.account_ids, '(static fallback)');
    
    if (credentials.account_ids.includes(accountId)) {
      console.log('✅ Real account ID is included in API payload');
    } else {
      console.log('❌ Real account ID is NOT included in API payload');
      console.log('💡 This means the system is using static fallback instead of real data');
    }

    // Test the specific user lookup
    console.log('\n🔍 Testing specific user lookup...');
    const userAppIds = pipedreamService.getUserAppIds(userId);
    console.log('User App IDs for', userId, ':', userAppIds);
    
    const userAppIdsEmail = pipedreamService.getUserAppIds(accountEmail);
    console.log('User App IDs for', accountEmail, ':', userAppIdsEmail);

    // Show the correct way to use the data
    console.log('\n🎯 CORRECT API USAGE:');
    console.log('=====================================');
    console.log('For user:', userId);
    console.log('Real account ID from webhook:', accountId);
    console.log('App name:', appName);
    console.log('Email:', accountEmail);
    
    console.log('\nCorrect API payload should be:');
    const correctPayload = {
      query: "find my documents",
      user_id: userId,
      user_email: accountEmail,
      account_ids: [accountId], // This should be the real account ID
      connected_apps: [{
        app_name: appName,
        account_id: accountId,
        categories: categories
      }],
      dynamic: true,
      source: 'webhook_data'
    };
    
    console.log(JSON.stringify(correctPayload, null, 2));

  } catch (error) {
    console.error('❌ Simulation failed:', error.message);
    console.error('📋 Error details:', error);
  }
}

// Run the simulation
simulateWebhookProcessing().catch(console.error);
