// server.js - Main entry point
const databaseConfig = require('./src/config/database');
require('dotenv').config();
// Start server only after DB is connected
(async () => {
  try {
    await databaseConfig.connect();
    await databaseConfig.initialize(); // Ensures indexes
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
})();

// Express server for OAuth callbacks and health checks
const express = require('express');
const authRoutes = require('./src/routes/auth');
const toolsRoutes = require('./src/routes/tools');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IMPORTANT: Mount webhook route BEFORE the middleware that logs it
app.use('/', authRoutes);
app.use('/api/tools', toolsRoutes);

// Remove the conflicting middleware that was causing 404
// This was intercepting the webhook before it reached the actual handler

// Pipedream Connect Apps page
app.get('/connect-apps', async (req, res) => {
  try {
    const pipedreamService = require('./src/services/pipedreamService');
    const { token } = req.query;

    // If no token provided, show demo/instructions page
    if (!token || token === 'demo') {
      res.send(`
        <html>
          <head>
            <title>Connect Your Apps - Enterprise Search Bot</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
              }
              .container {
                max-width: 1000px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
                color: white;
                padding: 40px;
                text-align: center;
              }
              .header h1 { font-size: 2.5em; margin-bottom: 10px; }
              .header p { font-size: 1.2em; opacity: 0.9; }
              .content { padding: 40px; }
              .demo-notice {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 30px;
                text-align: center;
              }
              .demo-notice h3 { color: #856404; margin-bottom: 10px; }
              .demo-notice p { color: #856404; }
              .steps { margin: 30px 0; }
              .step {
                background: #f8f9fa;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 20px;
                border-left: 4px solid #4285f4;
              }
              .step h3 { color: #2c3e50; margin-bottom: 10px; }
              .step p { color: #7f8c8d; line-height: 1.6; }
              .code {
                background: #2c3e50;
                color: #ecf0f1;
                padding: 15px;
                border-radius: 5px;
                font-family: 'Monaco', 'Consolas', monospace;
                margin: 10px 0;
              }
              .apps-preview {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin: 30px 0;
              }
              .app-preview {
                background: #f8f9fa;
                border-radius: 10px;
                padding: 20px;
                text-align: center;
                border: 2px solid #e9ecef;
              }
              .app-preview .icon { font-size: 2.5em; margin-bottom: 10px; }
              .app-preview h4 { color: #2c3e50; margin-bottom: 5px; }
              .app-preview p { color: #7f8c8d; font-size: 0.9em; }
              .btn {
                display: inline-block;
                padding: 12px 25px;
                background: #4285f4;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                transition: background 0.3s;
                margin: 10px;
              }
              .btn:hover { background: #3367d6; }
              .btn.secondary { background: #34a853; }
              .btn.secondary:hover { background: #2d8f47; }
              .navigation {
                background: #2c3e50;
                color: white;
                padding: 20px;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔗 Connect Your Apps</h1>
                <p>Set up integrations for personalized enterprise search</p>
              </div>

              <div class="content">
                <div class="demo-notice">
                  <h3>⚠️ Demo Mode</h3>
                  <p>This is a preview of the app connection interface. To connect real apps, you need to authenticate through Slack first.</p>
                </div>

                <div class="steps">
                  <div class="step">
                    <h3>Step 1: Connect via Slack</h3>
                    <p>Use the Slack bot to initiate the connection process:</p>
                    <div class="code">@Kroolo AI connect pipedream</div>
                  </div>

                  <div class="step">
                    <h3>Step 2: Choose Your Apps</h3>
                    <p>Select from popular enterprise tools or browse all available integrations:</p>
                  </div>

                  <div class="step">
                    <h3>Step 3: Start Searching</h3>
                    <p>Once connected, use natural language to search across all your tools:</p>
                    <div class="code">@Kroolo AI search for quarterly reports</div>
                  </div>
                </div>

                <h3 style="text-align: center; margin: 30px 0; color: #2c3e50;">🚀 Available Integrations</h3>

                <div class="apps-preview">
                  <div class="app-preview">
                    <div class="icon">📁</div>
                    <h4>Google Drive</h4>
                    <p>Search documents, spreadsheets, and presentations</p>
                  </div>
                  <div class="app-preview">
                    <div class="icon">💬</div>
                    <h4>Slack</h4>
                    <p>Find messages, files, and conversations</p>
                  </div>
                  <div class="app-preview">
                    <div class="icon">📦</div>
                    <h4>Dropbox</h4>
                    <p>Access files and folders in your Dropbox</p>
                  </div>
                  <div class="app-preview">
                    <div class="icon">🎫</div>
                    <h4>Jira</h4>
                    <p>Search tickets, projects, and issues</p>
                  </div>
                  <div class="app-preview">
                    <div class="icon">📚</div>
                    <h4>Document360</h4>
                    <p>Find knowledge base articles and docs</p>
                  </div>
                  <div class="app-preview">
                    <div class="icon">📧</div>
                    <h4>Gmail</h4>
                    <p>Search emails and attachments</p>
                  </div>
                </div>

                <div style="text-align: center; margin-top: 40px;">
                  <p style="color: #7f8c8d; margin-bottom: 20px;">Ready to get started?</p>
                  <a href="/" class="btn">← Back to Control Panel</a>
                  <a href="/test-oauth" class="btn secondary">Test OAuth Setup</a>
                </div>
              </div>

              <div class="navigation">
                <strong>Next:</strong> Go to Slack and type <code>@Kroolo AI connect pipedream</code> to begin
              </div>
            </div>
          </body>
        </html>
      `);
      return;
    }

    // If token provided, show actual connection interface
    const popularApps = pipedreamService.getPopularApps();

    res.send(`
      <html>
        <head>
          <title>Connect Your Apps - Enterprise Search Bot</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              padding: 20px;
            }
            .container {
              max-width: 1000px;
              margin: 0 auto;
              background: white;
              border-radius: 20px;
              box-shadow: 0 20px 40px rgba(0,0,0,0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
              color: white;
              padding: 40px;
              text-align: center;
            }
            .header h1 { font-size: 2.5em; margin-bottom: 10px; }
            .header p { font-size: 1.2em; opacity: 0.9; }
            .content { padding: 40px; }
            .general-connect {
              background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
              padding: 40px;
              border-radius: 15px;
              text-align: center;
              margin-bottom: 40px;
              color: white;
            }
            .general-connect h3 { font-size: 1.8em; margin-bottom: 15px; }
            .general-connect p { font-size: 1.1em; opacity: 0.9; margin-bottom: 25px; }
            .general-btn {
              display: inline-block;
              padding: 15px 30px;
              background: white;
              color: #3498db;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 1.1em;
              transition: all 0.3s;
            }
            .general-btn:hover { background: #ecf0f1; transform: translateY(-2px); }
            .apps-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
              gap: 25px;
              margin: 40px 0;
            }
            .app-card {
              background: white;
              border-radius: 15px;
              padding: 25px;
              box-shadow: 0 5px 15px rgba(0,0,0,0.1);
              text-align: center;
              transition: all 0.3s;
              border: 2px solid transparent;
            }
            .app-card:hover {
              transform: translateY(-5px);
              box-shadow: 0 10px 30px rgba(0,0,0,0.15);
              border-color: #4285f4;
            }
            .app-icon { font-size: 3em; margin-bottom: 15px; }
            .app-name { font-size: 1.3em; font-weight: 600; color: #2c3e50; margin-bottom: 10px; }
            .app-desc { color: #7f8c8d; font-size: 1em; margin-bottom: 20px; line-height: 1.5; }
            .connect-btn {
              display: inline-block;
              padding: 12px 25px;
              background: #27ae60;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              transition: all 0.3s;
            }
            .connect-btn:hover { background: #219a52; transform: translateY(-2px); }
            .footer {
              background: #2c3e50;
              color: white;
              padding: 30px;
              text-align: center;
            }
            .footer p { opacity: 0.8; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔗 Connect Your Apps</h1>
              <p>Choose which apps to connect for enhanced search and automation</p>
            </div>

            <div class="content">
              <div class="general-connect">
                <h3>🚀 Connect Any App</h3>
                <p>Browse all available apps and connect the ones you need for your workflow</p>
                <a href="https://pipedream.com/_static/connect.html?token=${token}&connectLink=true" class="general-btn" target="_blank">
                  Browse All Apps
                </a>
              </div>

              <h2 style="text-align: center; color: #2c3e50; margin-bottom: 30px; font-size: 2em;">⭐ Popular Apps</h2>

              <div class="apps-grid">
                ${popularApps.map(app => `
                  <div class="app-card">
                    <div class="app-icon">${app.icon}</div>
                    <div class="app-name">${app.name}</div>
                    <div class="app-desc">Connect ${app.name} for enhanced search and automation capabilities</div>
                    <a href="https://pipedream.com/_static/connect.html?token=${token}&connectLink=true&app=${app.slug}"
                       class="connect-btn" target="_blank">
                      Connect ${app.name}
                    </a>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="footer">
              <p>🔒 Your connections are secure and encrypted. Manage them anytime from your Pipedream dashboard.</p>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering connect apps page:', error);
    res.status(500).send('Error loading connect apps page');
  }
});

// Test OAuth flow endpoint
app.get('/test-oauth', (req, res) => {
  const pipedreamService = require('./src/services/pipedreamService');
  const testUserId = 'test-user-123';
  const authUrl = pipedreamService.generateAuthURL(testUserId);

  res.send(`
    <html>
      <head>
        <title>Test OAuth Flow - Enterprise Search Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
            color: white;
            padding: 40px;
            text-align: center;
          }
          .header h1 { font-size: 2.5em; margin-bottom: 10px; }
          .header p { font-size: 1.2em; opacity: 0.9; }
          .content { padding: 40px; }
          .test-section {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: center;
          }
          .test-section h3 { color: #2c3e50; margin-bottom: 15px; font-size: 1.5em; }
          .auth-url {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 20px;
            border-radius: 10px;
            word-break: break-all;
            margin: 20px 0;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9em;
            line-height: 1.4;
          }
          .btn {
            display: inline-block;
            padding: 15px 30px;
            background: #4285f4;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 1.1em;
            margin: 10px;
            transition: all 0.3s;
          }
          .btn:hover { background: #3367d6; transform: translateY(-2px); }
          .btn.secondary { background: #34a853; }
          .btn.secondary:hover { background: #2d8f47; }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 30px;
            margin: 30px 0;
          }
          .info-card {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            border-left: 4px solid #4285f4;
          }
          .info-card h3 { color: #2c3e50; margin-bottom: 15px; font-size: 1.3em; }
          .info-card ol, .info-card ul { text-align: left; padding-left: 20px; }
          .info-card li { margin-bottom: 8px; color: #7f8c8d; line-height: 1.5; }
          .info-card code {
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
            color: #2c3e50;
          }
          .status-indicators {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
          }
          .status-indicator {
            background: white;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border: 2px solid #e9ecef;
          }
          .status-indicator.success { border-color: #27ae60; }
          .status-indicator.warning { border-color: #f39c12; }
          .status-indicator.error { border-color: #e74c3c; }
          .status-indicator .icon { font-size: 2em; margin-bottom: 10px; }
          .status-indicator h4 { color: #2c3e50; margin-bottom: 5px; }
          .status-indicator p { color: #7f8c8d; font-size: 0.9em; }
          .navigation {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🧪 OAuth Testing Center</h1>
            <p>Test and debug your Pipedream OAuth configuration</p>
          </div>

          <div class="content">
            <div class="test-section">
              <h3>🔗 OAuth Flow Test</h3>
              <p style="color: #7f8c8d; margin-bottom: 20px;">Click the button below to test the complete OAuth authentication flow</p>
              <a href="${authUrl}" class="btn" target="_blank">� Start OAuth Test</a>
              <a href="/" class="btn secondary">← Back to Control Panel</a>
            </div>

            <div class="status-indicators">
              <div class="status-indicator success">
                <div class="icon">✅</div>
                <h4>Server Running</h4>
                <p>OAuth callback endpoint is active</p>
              </div>
              <div class="status-indicator ${process.env.PIPEDREAM_CLIENT_ID ? 'success' : 'warning'}">
                <div class="icon">${process.env.PIPEDREAM_CLIENT_ID ? '✅' : '⚠️'}</div>
                <h4>Client ID</h4>
                <p>${process.env.PIPEDREAM_CLIENT_ID ? 'Configured' : 'Missing from .env'}</p>
              </div>
              <div class="status-indicator ${process.env.PIPEDREAM_CLIENT_SECRET ? 'success' : 'warning'}">
                <div class="icon">${process.env.PIPEDREAM_CLIENT_SECRET ? '✅' : '⚠️'}</div>
                <h4>Client Secret</h4>
                <p>${process.env.PIPEDREAM_CLIENT_SECRET ? 'Configured' : 'Missing from .env'}</p>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-card">
                <h3>📋 Expected Flow</h3>
                <ol>
                  <li>Click "Start OAuth Test" button</li>
                  <li>Redirected to Pipedream authorization page</li>
                  <li>Login with your Pipedream account</li>
                  <li>Grant permissions to the app</li>
                  <li>Redirected back to <code>/auth/pipedream/callback</code></li>
                  <li>See success message with user details</li>
                </ol>
              </div>

              <div class="info-card">
                <h3>🔧 Troubleshooting</h3>
                <ul>
                  <li><strong>404 Error:</strong> Server not running on port 3000</li>
                  <li><strong>Redirect URI Mismatch:</strong> Check Pipedream app settings</li>
                  <li><strong>Invalid Client:</strong> Verify Client ID in .env file</li>
                  <li><strong>Access Denied:</strong> User cancelled authorization</li>
                  <li><strong>Invalid State:</strong> Session expired or tampered</li>
                </ul>
              </div>
            </div>

            <div style="background: #e8f4fd; border-radius: 10px; padding: 20px; margin: 30px 0;">
              <h3 style="color: #2c3e50; margin-bottom: 15px;">🔍 Generated OAuth URL</h3>
              <p style="color: #7f8c8d; margin-bottom: 15px;">This is the URL that will be used for authentication:</p>
              <div class="auth-url">${authUrl}</div>
            </div>

            <div style="text-align: center; margin-top: 40px;">
              <p style="color: #7f8c8d; margin-bottom: 20px;">Need help setting up OAuth?</p>
              <a href="/health" class="btn">View System Health</a>
              <a href="/connect-apps?token=demo" class="btn secondary">Preview App Connections</a>
            </div>
          </div>

          <div class="navigation">
            <strong>Test User ID:</strong> ${testUserId} |
            <strong>Callback URL:</strong> /auth/pipedream/callback
          </div>
        </div>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'slack-enterprise-search-bot',
    version: '1.0.0',
    endpoints: {
      pipedream_callback: '/auth/pipedream/callback',
      test_oauth: '/test-oauth',
      connect_apps: '/connect-apps'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Slack Enterprise Search Bot - Control Panel</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
            color: white;
            padding: 40px;
            text-align: center;
          }
          .header h1 { font-size: 2.5em; margin-bottom: 10px; }
          .header p { font-size: 1.2em; opacity: 0.9; }
          .nav-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            padding: 40px;
          }
          .nav-card {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            transition: transform 0.3s, box-shadow 0.3s;
            border: 2px solid transparent;
          }
          .nav-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            border-color: #4285f4;
          }
          .nav-card .icon { font-size: 3em; margin-bottom: 15px; }
          .nav-card h3 { color: #2c3e50; margin-bottom: 15px; font-size: 1.4em; }
          .nav-card p { color: #7f8c8d; margin-bottom: 20px; line-height: 1.6; }
          .btn {
            display: inline-block;
            padding: 12px 25px;
            background: #4285f4;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: background 0.3s;
          }
          .btn:hover { background: #3367d6; }
          .btn.secondary { background: #34a853; }
          .btn.secondary:hover { background: #2d8f47; }
          .status-bar {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            font-family: 'Monaco', 'Consolas', monospace;
          }
          .features {
            background: #ecf0f1;
            padding: 40px;
          }
          .features h3 { text-align: center; margin-bottom: 30px; color: #2c3e50; }
          .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
          }
          .feature {
            background: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .feature .emoji { font-size: 2em; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🤖 Enterprise Search Bot</h1>
            <p>AI-Powered Search Assistant Control Panel</p>
          </div>

          <div class="nav-grid">
            <div class="nav-card">
              <div class="icon">🔗</div>
              <h3>Connect Apps</h3>
              <p>Connect your tools and platforms for personalized search. Set up Google Drive, Slack, Dropbox, and more.</p>
              <a href="/connect-apps?token=demo" class="btn">Connect Your Apps</a>
            </div>

            <div class="nav-card">
              <div class="icon">🧪</div>
              <h3>Test OAuth</h3>
              <p>Test your Pipedream OAuth configuration and authentication flow. Debug connection issues.</p>
              <a href="/test-oauth" class="btn secondary">Test OAuth Flow</a>
            </div>

            <div class="nav-card">
              <div class="icon">📊</div>
              <h3>System Health</h3>
              <p>Check system status, API endpoints, and service health. Monitor bot performance.</p>
              <a href="/health" class="btn">View Health Status</a>
            </div>
          </div>

          <div class="features">
            <h3>🚀 Bot Capabilities</h3>
            <div class="features-grid">
              <div class="feature">
                <div class="emoji">🔍</div>
                <h4>Enterprise Search</h4>
                <p>Search across Google Drive, Slack, Dropbox, Jira, Zendesk, Document360</p>
              </div>
              <div class="feature">
                <div class="emoji">🧠</div>
                <h4>AI-Powered NLP</h4>
                <p>OpenAI GPT and Google Gemini for intelligent query processing</p>
              </div>
              <div class="feature">
                <div class="emoji">�</div>
                <h4>Dynamic Authentication</h4>
                <p>Pipedream OAuth for personalized user credentials</p>
              </div>
              <div class="feature">
                <div class="emoji">🛡️</div>
                <h4>Triple RBAC Security</h4>
                <p>Account IDs, external user ID, and email-based access control</p>
              </div>
              <div class="feature">
                <div class="emoji">📊</div>
                <h4>Real-time Analytics</h4>
                <p>Comprehensive logging and performance monitoring</p>
              </div>
              <div class="feature">
                <div class="emoji">📱</div>
                <h4>Beautiful Slack UI</h4>
                <p>Rich attachments, buttons, and interactive elements</p>
              </div>
            </div>
          </div>

          <div class="status-bar">
            <strong>Status:</strong> ✅ Online and Ready |
            <strong>Time:</strong> ${new Date().toISOString()} |
            <strong>Version:</strong> 1.0.0
          </div>
        </div>
      </body>
    </html>
  `);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 OAuth callback: http://localhost:${PORT}/auth/pipedream/callback`);
  console.log(`🌐 Root: http://localhost:${PORT}`);
});

module.exports = app;
