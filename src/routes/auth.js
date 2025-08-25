// OAuth Authentication Routes for Pipedream Integration
// Handles OAuth callbacks and authentication flow

const express = require('express');
const pipedreamService = require('../services/pipedreamService');
const databaseService = require('../services/databaseService');

const router = express.Router();

// Pipedream OAuth callback endpoint
router.get('/pipedream/callback', async (req, res) => {
  try {
    console.log('🔄 Pipedream OAuth callback received');
    console.log('   Query params:', req.query);

    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('❌ OAuth error:', error);
      return res.status(400).send(`
        <html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #e74c3c;">❌ Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Please try connecting again from Slack.</p>
            <button onclick="window.close()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
          </body>
        </html>
      `);
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('❌ Missing required OAuth parameters');
      return res.status(400).send(`
        <html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #e74c3c;">❌ Invalid Request</h1>
            <p>Missing required authentication parameters.</p>
            <p>Please try connecting again from Slack.</p>
            <button onclick="window.close()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
          </body>
        </html>
      `);
    }

    // Process the OAuth callback
    const userAuth = await pipedreamService.handleAuthCallback(code, state);

    // Success response
    res.send(`
      <html>
        <head>
          <title>Pipedream Connected Successfully</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
            .success-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .success-icon { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #27ae60; margin-bottom: 20px; }
            .user-info { background: #ecf0f1; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .close-btn { padding: 15px 30px; background: #27ae60; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 20px; }
            .close-btn:hover { background: #229954; }
          </style>
        </head>
        <body>
          <div class="success-container">
            <div class="success-icon">✅</div>
            <h1>Successfully Connected!</h1>
            <p>Your Pipedream account has been connected to the Slack bot.</p>
            
            <div class="user-info">
              <strong>Connected Account:</strong><br>
              📧 ${userAuth.email}<br>
              👤 ${userAuth.name}<br>
              🆔 ${userAuth.pipedreamUserId}
            </div>
            
            <p>You can now use personalized search in Slack!</p>
            <p><strong>Try these commands:</strong></p>
            <ul style="text-align: left; display: inline-block;">
              <li><code>@Kroolo AI search for documents</code></li>
              <li><code>@Kroolo AI pipedream status</code></li>
              <li><code>@Kroolo AI pipedream tools</code></li>
            </ul>
            
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
          
          <script>
            // Auto-close after 10 seconds
            setTimeout(() => {
              window.close();
            }, 10000);
          </script>
        </body>
      </html>
    `);

    console.log('✅ OAuth callback processed successfully');
    console.log('   User:', userAuth.email);
    console.log('   Slack User ID:', userAuth.slackUserId);

  } catch (error) {
    console.error('❌ OAuth callback error:', error.message);
    
    res.status(500).send(`
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e74c3c;">❌ Authentication Error</h1>
          <p>An error occurred while connecting your account:</p>
          <p style="color: #7f8c8d; font-style: italic;">${error.message}</p>
          <p>Please try connecting again from Slack.</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
});


// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'oauth-auth'
  });
});

// Enhanced Pipedream Connect success callback with real account ID tracking
router.get('/pipedream/success', async (req, res) => {
  try {
    console.log('\n🎉 ===== ENHANCED PIPEDREAM SUCCESS CALLBACK =====');
    console.log('📊 Query params:', req.query);
    console.log('📊 Headers:', req.headers);
    console.log('🌐 Full URL:', req.url);
    console.log('⏰ Timestamp:', new Date().toISOString());

    const { external_user_id, account_id, app, token, ap_id, source } = req.query;
    
    // Priority: Use ap_id if available, otherwise account_id
    const realAccountId = ap_id || account_id;
    
    // Check if we have the minimum required data
    if (external_user_id && realAccountId) {
      console.log('✅ VALID SUCCESS CALLBACK - Storing connection...');

      const pipedreamService = require('../services/pipedreamService');
      const storeResult = await pipedreamService.storeRealConnection(
        external_user_id, 
        app || 'unknown_app', 
        realAccountId, 
        null
      );
      
      if (storeResult.success) {
        console.log('✅ Connection stored successfully from success callback!');
        console.log('   📊 Total connections for user:', storeResult.total_connections);
        console.log('   🔗 Stored Account ID:', realAccountId);

        // 🎯 TRIGGER WEBHOOK CALL AFTER SUCCESS
        console.log('🔄 Triggering webhook call after success...');
        try {
          const axios = require('axios');
          const webhookData = {
            event: 'CONNECTION_SUCCESS',
            account: {
              id: realAccountId,
              email: null
            },
            app: {
              name: app || 'unknown_app',
              name_slug: app || 'unknown_app'
            },
            user_id: external_user_id,
            external_user_id: external_user_id,
            source: 'success_callback_trigger'
          };

          const webhookUrl = `${req.protocol}://${req.get('host')}/api/pipedream/webhook`;
          console.log('📡 Calling webhook URL:', webhookUrl);
          
          const webhookResponse = await axios.post(webhookUrl, webhookData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          });
          
          console.log('✅ Webhook triggered successfully:', webhookResponse.data);
        } catch (webhookError) {
          console.error('❌ Failed to trigger webhook:', webhookError.message);
        }
      } else {
        console.error('❌ Failed to store connection:', storeResult.error);
      }
    } else {
      console.warn('⚠️ MISSING REQUIRED PARAMETERS');
      console.warn('   Missing external_user_id:', !external_user_id);
      console.warn('   Missing account_id/ap_id:', !realAccountId);
    }

    // Enhanced success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Status</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .success { color: #27ae60; font-size: 48px; margin-bottom: 20px; }
            .details { background: #e8f5e8; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #27ae60; }
            .btn { display: inline-block; padding: 12px 24px; background: #27ae60; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅</div>
            <h1>Connection Successful!</h1>
            <p>Your Pipedream account has been connected successfully.</p>
            
            <div class="details">
              <strong>Connection Details:</strong><br>
              🔗 Account ID: ${realAccountId || 'Not available'}<br>
              📱 App: ${app || 'Not specified'}<br>
              👤 User: ${external_user_id || 'Not provided'}<br>
              🎯 Source: ${source || 'pipedream_connect'}<br>
              ⏰ Connected: ${new Date().toLocaleString()}
            </div>
            
            <p>You can now close this window and return to Slack.</p>
            ${realAccountId ? '<p><strong>Your bot will now use this real account ID for searches!</strong></p>' : '<p><strong>Please check server logs for debugging information.</strong></p>'}
            
            <a href="javascript:window.close()" class="btn">Close Window</a>
          </div>
        </body>
      </html>
    `);

    console.log('===== END ENHANCED SUCCESS CALLBACK =====\n');

  } catch (error) {
    console.error('❌ Error in enhanced success callback:', error.message);
    res.status(500).send('Error processing connection');
  }
});

// Handle Pipedream popup auth success (matches the URL pattern from your screenshot)
router.get('/popup/auth/success', async (req, res) => {
  try {
    console.log('🎉 PIPEDREAM POPUP AUTH SUCCESS!');
    console.log('📊 Query params:', req.query);
    console.log('📊 Full URL:', req.url);

    const { ap_id, is_connect, external_user_id, app } = req.query;

    if (ap_id) {
      console.log('✅ REAL APP ID EXTRACTED FROM POPUP:');
      console.log('   🔗 App ID (ap_id):', ap_id);
      console.log('   🔗 Is Connect:', is_connect);
      console.log('   👤 External User ID:', external_user_id || 'Not provided');
      console.log('   📱 App:', app || 'Not specified');

      // Store the REAL connection with the extracted app ID
      const pipedreamService = require('../services/pipedreamService');

      // If we have external_user_id, store the connection
      if (external_user_id) {
        const storeResult = await pipedreamService.storeRealConnection(
          external_user_id,
          app || 'unknown_app',
          ap_id, // Use the real app ID from ap_id parameter
          null // email will be extracted from user context
        );

        if (storeResult.success) {
          console.log('✅ Real app ID stored successfully!');
          console.log('   📊 Total connections for user:', storeResult.total_connections);
          console.log('   🔗 Stored App ID:', ap_id);

          // Notify the user in Slack about successful connection
          await pipedreamService.notifyConnectionSuccess(external_user_id, app || 'unknown_app', ap_id);
        } else {
          console.error('❌ Failed to store real app ID:', storeResult.error);
        }
      } else {
        console.log('⚠️ No external_user_id provided, storing app ID for later association');
        // You might want to store this temporarily and associate it later
      }
    } else {
      console.log('⚠️ No ap_id found in popup success URL');
    }

    // Show success page with extracted app ID
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>App Connected Successfully!</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
            .success-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .success { color: #27ae60; font-size: 64px; margin-bottom: 20px; }
            .app-id { background: #e8f5e8; padding: 15px; border-radius: 8px; font-family: monospace; margin: 15px 0; font-size: 18px; font-weight: bold; }
            .details { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: left; }
            .close-btn { padding: 15px 30px; background: #27ae60; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 20px; }
            .close-btn:hover { background: #229954; }
          </style>
        </head>
        <body>
          <div class="success-container">
            <div class="success">🎉</div>
            <h1>App Connected Successfully!</h1>
            <p>Your ${app || 'application'} has been connected and the real app ID has been extracted.</p>

            <div class="app-id">
              Real App ID: ${ap_id || 'Not extracted'}
            </div>

            <div class="details">
              <strong>Connection Details:</strong><br>
              🔗 App ID: ${ap_id || 'Not available'}<br>
              📱 App: ${app || 'Not specified'}<br>
              👤 User: ${external_user_id || 'Not provided'}<br>
              🔗 Connect Mode: ${is_connect || 'false'}<br>
              ⏰ Connected: ${new Date().toLocaleString()}
            </div>

            <p>This real app ID will now be used for all API calls and searches!</p>
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Error in popup auth success:', error.message);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e74c3c;">❌ Error</h1>
          <p>Error processing connection: ${error.message}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
});

// Pipedream Connect error callback
router.get('/pipedream/error', async (req, res) => {
  try {
    console.log('❌ Pipedream Connect error callback received');
    console.log('   Query params:', req.query);

    const errorMessage = req.query.message || 'Unknown error occurred';

    res.send(`
      <html>
        <head>
          <title>Pipedream Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #e74c3c; font-size: 48px; margin-bottom: 20px; }
            .title { color: #2c3e50; margin-bottom: 15px; }
            .subtitle { color: #7f8c8d; margin-bottom: 30px; }
            .button { padding: 12px 24px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 5px; }
            .button:hover { background: #2980b9; }
            .retry { background: #e67e22; }
            .retry:hover { background: #d35400; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌</div>
            <h1 class="title">Connection Failed</h1>
            <p class="subtitle">There was an issue connecting your Pipedream account.</p>
            <p style="color: #7f8c8d; font-style: italic;">${errorMessage}</p>
            <p>Please try connecting again from Slack by typing: <code>@Kroolo AI connect pipedream</code></p>
            <button class="button" onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Pipedream error callback error:', error.message);
    res.send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #e74c3c;">❌ Error</h1>
          <p>An unexpected error occurred.</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
});

// Simplified Pipedream webhook handler - stores only essential data
router.post('/api/pipedream/webhook', async (req, res) => {
  try {
    console.log('\n🎯 ===== PIPEDREAM WEBHOOK RECEIVED =====');
    console.log('📥 Webhook Event Received:', JSON.stringify(req.body, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());

    const { body } = req;
    const { account, app, event } = body;

    // Extract essential data from different webhook formats
    // Handle both Pipedream standard format and our custom CONNECTION_SUCCESS format
    const userId =  account?.external_id;
    const accountId = account?.id;
    const appName = app?.name_slug || app?.slug || app?.name || account?.app?.name_slug;
    const appDisplayName = app?.name || account?.app?.name;
    const accountEmail =  account?.name || account?.external_id;
    const categories = account?.app?.categories;

    console.log('🧩 Extracted Essential Data:');
    console.log('   🔗 Account ID:', accountId);
    console.log('   📱 App Name:', appName);
    console.log('   �👤 User ID:', userId);
    console.log('   � App Display Name:', appDisplayName);
    console.log('   �📧 Account Email:', accountEmail);
    console.log('   🎯 Event Type:', event);
    console.log('   🏷️ App Categories:', categories);

    if (!accountId || !appName || !userId) {
      console.error('❌ Missing required fields in webhook payload');
      console.error('   Missing Account ID:', !accountId);
      console.error('   Missing App Name:', !appName);
      console.error('   Missing User ID:', !userId);
      return res.status(400).json({
        error: 'Missing required fields',
        missing: {
          accountId: !accountId,
          appName: !appName,
          userId: !userId
        }
      });
    }

    // Handle CONNECTION_SUCCESS event with essential data storage only
    if (event === 'CONNECTION_SUCCESS' || event === 'connection.created') {
      console.log('🎉 CONNECTION SUCCESS EVENT - Storing essential data only...');

      try {
        // Use database service to store essential data
        const databaseService = require('../services/databaseService');

        console.log("calling databaseService");
        // Store connection using new model (arrays for appNames/accountIds/accountEmails)
        const storeResult = await databaseService.storeConnection({
          slackUserId: userId,
          appName,
          accountId,
          accountEmail
        });

        if (storeResult) {
          console.log('✅ ESSENTIAL DATA STORED SUCCESSFULLY!');
          console.log('   📊 Connection:', storeResult);
          // Also store in pipedream service for backward compatibility
          const pipedreamService = require('../services/pipedreamService');
          await pipedreamService.storeRealConnection(
            userId,
            appName,
            accountId,
            accountEmail
          );

          // Trigger ingestion for supported apps
          console.log('🔄 Triggering ingestion for app:', appName);
          const ingestionBody = {
            services: [appName],
            account_google_drive: undefined,
            account_slack: undefined,
            account_dropbox: undefined,
            account_jira: undefined,
            account_sharepoint: undefined,
            account_confluence: undefined,
            account_microsoft_teams: undefined,
            account_zendesk: undefined,
            account_document360: undefined,
            external_user_id: userId,
            user_email: accountEmail,
            limit: 2,
            empty: false,
            chunkall: false,
            websocket_session_id: accountId,
          };

          // Set the appropriate account field based on appName
          switch (appName) {
            case "google_drive":
              ingestionBody.account_google_drive = accountId;
              break;
            case "dropbox":
              ingestionBody.account_dropbox = accountId;
              break;
            case "slack":
              ingestionBody.account_slack = accountId;
              break;
            case "jira":
              ingestionBody.account_jira = accountId;
              break;
            case "sharepoint":
              ingestionBody.account_sharepoint = accountId;
              break;
            case "confluence":
              ingestionBody.account_confluence = accountId;
              break;
            case "microsoft_teams":
              ingestionBody.account_microsoft_teams = accountId;
              break;
            case "zendesk":
              ingestionBody.account_zendesk = accountId;
              break;
            case "document360":
              ingestionBody.account_document360 = accountId;
              break;
            default:
              console.log('⚠️ Unsupported app for ingestion:', appName);
              break;
          }

          // Remove undefined account fields
          Object.keys(ingestionBody).forEach(
            (key) => ingestionBody[key] === undefined && delete ingestionBody[key]
          );

          // Get the ingest endpoint from environment variables or use default
          const ingestEndpoint = `${process.env.API_BASE_URL}/ingest`;
          console.log('🔗 Ingest API Endpoint:', ingestEndpoint);

          try {
            // Call the ingest API
            console.log('📤 Ingestion payload:', JSON.stringify(ingestionBody, null, 2));
            const axios = require('axios');
            const ingestResponse = await axios.post(ingestEndpoint, ingestionBody, {
              headers: { "Content-Type": "application/json" },
            });

            console.log('✅ Ingestion triggered successfully');
            console.log('📊 Response:', ingestResponse.status, ingestResponse.statusText);
          } catch (ingestError) {
            console.error('❌ Error triggering ingestion:', ingestError.message);
          }
        } else {
          console.error('❌ Failed to store essential data');
        }

      } catch (dbError) {
        console.error('❌ Database storage error:', dbError.message);

        // Fallback to pipedream service storage
        console.log('⚠️ Falling back to pipedream service storage...');
        const pipedreamService = require('../services/pipedreamService');
        const fallbackResult = await pipedreamService.storeRealConnection(
          userId,
          appName,
          accountId,
          accountEmail
        );

        if (fallbackResult.success) {
          console.log('✅ Fallback storage successful');
        }
      }
    }

    console.log('✅ Webhook processed successfully');
    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      processed_at: new Date().toISOString(),
      data_stored: {
        account_id: accountId,
        app_name: appName,
        app_display_name: appDisplayName,
        user_id: userId,
        account_email: accountEmail,
        categories: categories,
        essential_data_only: true
      }
    });

  } catch (error) {
    console.error('❌ Error processing enhanced webhook event:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
