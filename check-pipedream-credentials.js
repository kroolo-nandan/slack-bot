#!/usr/bin/env node

// Check if your Pipedream credentials are valid OAuth credentials
require('dotenv').config();
const axios = require('axios');

async function checkPipedreamCredentials() {
  console.log('🔍 Checking Pipedream Credentials');
  console.log('='.repeat(40));

  const clientId = process.env.PIPEDREAM_CLIENT_ID;
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
  const projectId = process.env.PIPEDREAM_PROJECT_ID;

  console.log('\n📋 Current Credentials:');
  console.log(`   Client ID: ${clientId || 'Not set'}`);
  console.log(`   Project ID: ${projectId || 'Not set'}`);
  console.log(`   Client Secret: ${clientSecret ? 'Set (hidden)' : 'Not set'}`);

  if (!clientId || !clientSecret) {
    console.log('\n❌ Missing Pipedream credentials in .env file');
    console.log('\n💡 You have two options:');
    console.log('1. Set up Pipedream OAuth (see PIPEDREAM_OAUTH_SETUP.md)');
    console.log('2. Use Google OAuth instead (simpler setup)');
    return;
  }

  // Test 1: Check if these are valid OAuth credentials by testing authorization URL
  console.log('\n🧪 Test 1: Testing OAuth Authorization URL');
  try {
    const testAuthUrl = `https://pipedream.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=http://localhost:3000/test`;
    console.log(`   Generated URL: ${testAuthUrl.substring(0, 80)}...`);
    
    // Try to access the authorization endpoint
    const response = await axios.get(testAuthUrl, { 
      timeout: 5000,
      validateStatus: () => true // Don't throw on any status
    });
    
    if (response.status === 200) {
      console.log('   ✅ OAuth authorization endpoint accessible');
      console.log('   ✅ Client ID appears to be valid');
    } else if (response.status === 400) {
      console.log('   ⚠️ OAuth endpoint accessible but client ID may be invalid');
    } else {
      console.log(`   ❌ Unexpected response: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Error accessing OAuth endpoint: ${error.message}`);
  }

  // Test 2: Check if these are API credentials instead
  console.log('\n🧪 Test 2: Testing as API Credentials');
  try {
    const apiResponse = await axios.get('https://api.pipedream.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${clientSecret}`
      },
      timeout: 5000
    });
    
    console.log('   ✅ These appear to be API credentials, not OAuth credentials');
    console.log('   📊 API Response:', apiResponse.data);
    console.log('\n💡 You need to create OAuth credentials separately');
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('   ❌ Invalid API credentials');
    } else {
      console.log(`   ⚠️ API test inconclusive: ${error.message}`);
    }
  }

  console.log('\n🎯 Recommendations:');
  
  if (clientId && clientSecret) {
    console.log('\n📝 Your current credentials might be:');
    console.log('   • API keys (for accessing Pipedream API directly)');
    console.log('   • OAuth credentials (for user authentication)');
    console.log('   • Project credentials (for managing workflows)');
    
    console.log('\n🔧 To set up OAuth properly:');
    console.log('1. Go to: https://pipedream.com/apps');
    console.log('2. Look for "OAuth Apps", "Developer", or "Applications" section');
    console.log('3. Create a new OAuth application');
    console.log('4. Use redirect URI: http://localhost:3000/auth/pipedream/callback');
    console.log('5. Replace your .env credentials with the OAuth app credentials');
  }

  console.log('\n🚀 Alternative: Use Google OAuth');
  console.log('   • Simpler setup process');
  console.log('   • Well-documented Google Console');
  console.log('   • Same dynamic authentication benefits');
  console.log('   • Add to .env: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');

  console.log('\n📖 Next Steps:');
  console.log('1. Read PIPEDREAM_OAUTH_SETUP.md for detailed Pipedream setup');
  console.log('2. OR switch to Google OAuth (I can help set this up)');
  console.log('3. OR use static credentials only (simplest option)');
}

checkPipedreamCredentials().catch(console.error);
