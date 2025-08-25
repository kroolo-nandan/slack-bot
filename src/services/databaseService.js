// Database Service
// Handles all database operations for users and connections

const mongoose = require('mongoose');
const User = require('../models/User');
const Connection = require('../models/Connection');

// Ensure user exists, create if not
async function ensureUser(slackUserId, email) {
  let user = await User.findOne({ slackUserId });
  if (!user) {
    user = new User({
      slackUserId,
      email,
      createdAt: new Date()
    });
    await user.save();
  }
  return user;
}

async function storeConnection({ slackUserId, appName, accountId, accountEmail }) {

  let connection = await Connection.findOne({ slackUserId });

  if (!connection) {
    // No document exists — create a new one
    connection = new Connection({
      slackUserId,
      appNames: [appName],
      accountIds: [accountId],
      accountEmails: accountEmail,
      status: 'active',
      connectedAt: new Date()
    });

    await connection.save();
    return connection;
  }

  // Document exists — append new values if not already present
  let updated = false;

  if (!connection.appNames.includes(appName)) {
    connection.appNames.push(appName);
    updated = true;
  }

  if (!connection.accountIds.includes(accountId)) {
    connection.accountIds.push(accountId);
    updated = true;
  }

  if (accountEmail && !connection.accountEmails.includes(accountEmail)) {
    connection.accountEmails = accountEmail;
    updated = true;
  }

  if (updated) {
    connection.updatedAt = new Date();
    await connection.save();
  }

  return connection;
}

// Get appName and accountIds for a given slackUserId
async function getUserConnections(slackUserId, slackEmail) {
  try {
    const connection = await Connection.findOne({ slackUserId });


    if (!connection) {
      // Fallback: return static/default connection
      return {
        slackUserId,
        slackEmail,
        appNames: ["google_drive","slack"],
        accountIds: ["apn_XehedEz",
          "apn_Xehed1w",
    ]
      };
    }

    return {
      slackUserId: connection.slackUserId,
      slackEmail: connection.accountEmails || "amar.kumar@kroolo.com",         
      appNames: connection.appNames || [],
      accountIds: connection.accountIds || []
    };
  } catch (err) {
    console.error('❌ Error fetching user connections:', err.message);
    return {
      slackUserId,
      slackEmail,
      appNames: [],
      accountIds: [],
      error: 'Failed to fetch connection info'
    };
  }
}

// Disconnect a specific tool for a user
async function disconnectUserConnection(slackUserId, appName) {
  try {
    console.log('🔌 Disconnecting tool for user:', slackUserId, 'app:', appName);
    
    const connection = await Connection.findOne({ slackUserId });
    
    if (!connection) {
      console.log('⚠️ No connection found for user:', slackUserId);
      return false;
    }
    
    // Find the index of the app in the appNames array
    const appIndex = connection.appNames.indexOf(appName);
    
    if (appIndex === -1) {
      console.log('⚠️ App not found in user connections:', appName);
      return false;
    }
    
    // Get the account ID that corresponds to this app
    const accountId = connection.accountIds[appIndex];
    
    // Remove the app and its corresponding account ID
    connection.appNames.splice(appIndex, 1);
    connection.accountIds.splice(appIndex, 1);
    
    
    connection.updatedAt = new Date();
    await connection.save();
    
    console.log('✅ Successfully disconnected tool:', appName);
    console.log('   Removed account ID:', accountId);
    console.log('   Remaining apps:', connection.appNames.length);
    
    return true;
  } catch (err) {
    console.error('❌ Error disconnecting user connection:', err.message);
    return false;
  }
}

module.exports = {
  ensureUser,
  storeConnection,
  getUserConnections,
  disconnectUserConnection
};

