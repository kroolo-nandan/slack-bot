const { App } = require('@slack/bolt');
require('dotenv').config();

// Initialize the app with your tokens and enable Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// Listener for the '/test-bot' slash command
app.command('/test-bot', async ({ ack, say }) => {
  // Acknowledge the command request
  await ack();
  
  // Send a message back to the channel where the command was used
  await say('Hello! Im alive and responding to your command. 🤖');
});

// Listener for when the bot is mentioned
// This is triggered when a user types '@your-bot-name' in a channel
app.event('app_mention', async ({ event, say }) => {
  try {
    // Send a message directly to the user who mentioned the bot
    await say({
      channel: event.user,
      text: `Hey <@${event.user}>, you mentioned me! I'm running locally. 👋`
    });
  } catch (error) {
    console.error(error);
  }
});

// Start the app
(async () => {
  try {
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Bolt app is running in Socket Mode!');
  } catch (error) {
    console.error('Failed to start the app:', error);
  }
})();