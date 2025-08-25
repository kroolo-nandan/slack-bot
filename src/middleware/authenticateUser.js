const UserModel = require("../models/User");
const MembersModel = require("../models/Members");
const CompanyModel = require("../models/Company");
const SlackSessionModel = require("../models/SlackSession");

const requireUserAuthentication = async ({ email, client, channel, slackUserId, channelId, onDeny }) => {
  const signupUrl = "https://app.kroolo.com/signup";

  if (!email) {
    if (client && channel) {
      const post = async (payload) => slackUserId
        ? client.chat.postEphemeral({ channel, user: slackUserId, ...payload })
        : client.chat.postMessage({ channel, ...payload });
      await post({
        text: "🔐 Authentication Required",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🔐 Authentication Required",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Hi there! 👋\n\nI couldn't find an email address associated with your Slack profile. To use this bot, you'll need a Kroolo account.\n\n*Don't worry - it only takes a minute to get started!*",
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "📝 *What you can do:*\n• Sign up for a new Kroolo account\n• Login if you already have an account\n",
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "🚀 Get Started",
                  emoji: true,
                },
                url: signupUrl,
                style: "primary",
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "ℹ️ *Tip:* Make sure your Slack profile has an email address for seamless authentication.",
              },
            ],
          },
        ],
      });
    }
    if (onDeny) onDeny();
    return null;
  }

  // Example override email (remove in production)
  // email = "piyush.upadhyay@kroolo.info";

  const user = await UserModel.findOne({ email: email.trim(), status: "ACTIVE" });
  if (!user) {
    // Check if user exists but is inactive
    const inactiveUser = await UserModel.findOne({ email: email.trim(), status: "INACTIVE" });
    
    if (client && channel) {
      const post = async (payload) => slackUserId
        ? client.chat.postEphemeral({ channel, user: slackUserId, ...payload })
        : client.chat.postMessage({ channel, ...payload });
      if (inactiveUser) {
        // User exists but is inactive
        await post({
          text: "⚠️ Account Inactive",
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "⚠️ Account Inactive",
                emoji: true,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Hello! 👋\n\nI found your account (${email}), but it appears to be inactive at the moment.\n\n*Don't worry - this can be easily resolved!*`,
              },
            },
            {
              type: "divider",
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "🔧 *How to reactivate:*\n• Login to your Kroolo account\n",
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "🔓 Reactivate Account",
                    emoji: true,
                  },
                  url: signupUrl,
                  style: "primary",
                },
              ],
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `📧 Account email: *${email}* | 🕐 Please allow up to 24 hours for account activation.`,
                },
              ],
            },
          ],
        });
    //   } else {
    //     // User doesn't exist at all
    //     await post({
    //       text: "👤 Account Not Found",
    //       blocks: [
    //         {
    //           type: "header",
    //           text: {
    //             type: "plain_text",
    //             text: "👤 Account Not Found",
    //             emoji: true,
    //           },
    //         },
    //         {
    //           type: "section",
    //           text: {
    //             type: "mrkdwn",
    //             text: `Hello! 👋\n\nI couldn't find a Kroolo account associated with *${email}*.\n\n*Ready to join thousands of users already using Kroolo?*`,
    //           },
    //         },
    //         {
    //           type: "divider",
    //         },
    //         {
    //           type: "section",
    //           text: {
    //             type: "mrkdwn",
    //             text: "✨ *Why join Kroolo?*\n• 🚀 Streamline your workflows\n• 🤖 AI-powered assistance\n• 🔗 Connect all your favorite tools\n• 📊 Boost your productivity",
    //           },
    //         },
    //         {
    //           type: "actions",
    //           elements: [
    //             {
    //               type: "button",
    //               text: {
    //                 type: "plain_text",
    //                 text: "🎉 Create Account",
    //                 emoji: true,
    //               },
    //               url: signupUrl,
    //               style: "primary",
    //             },
    //             {
    //               type: "button",
    //               text: {
    //                 type: "plain_text",
    //                 text: "🔑 Already Have Account?",
    //                 emoji: true,
    //               },
    //               url: "https://app.kroolo.com/login",
    //             },
    //           ],
    //         },
    //         {
    //           type: "context",
    //           elements: [
    //             {
    //               type: "mrkdwn",
    //               text: `📧 Looking for: *${email}* | 💡 *Tip:* Make sure you're using the same email as your Slack profile.`,
    //             },
    //           ],
    //         },
    //       ],
    //     });
      }
    }
    if (onDeny) onDeny();
    return null;
  }

  // If we have slackUserId, ensure company selection exists in session
  try {
    if (slackUserId) {
      // Check for existing session/company selection (per channel)
      let session = await SlackSessionModel.findOne({ slackUserId, channelId });
      if (session && session.companyId && session.role) {
        // Already selected, allow processing silently
        return user.userId;
      }

      // No selection yet: fetch companies for user and prompt selection
      const memberships = await MembersModel.find({ userId: user.userId, status: "ACTIVE" });
      if (!memberships || memberships.length === 0) {
        if (client && channel) {
          const post = async (payload) => slackUserId
            ? client.chat.postEphemeral({ channel, user: slackUserId, ...payload })
            : client.chat.postMessage({ channel, ...payload });
          await post({ text: "You don't seem to belong to any company yet. Please contact your admin." });
        }
        if (onDeny) onDeny();
        return null;
      }

      const companyIds = memberships.map((m) => m.companyId);
      const companies = await CompanyModel.find({ companyId: { $in: companyIds } });

      // Build quick lookup for names
      const nameByCompanyId = new Map();
      companies.forEach((c) => nameByCompanyId.set(String(c.companyId), c.name));

      // Prepare a single-button CTA to open a modal picker

      if (client && channel) {
        const post = async (payload) => slackUserId
          ? client.chat.postEphemeral({ channel, user: slackUserId, ...payload })
          : client.chat.postMessage({ channel, ...payload });
        await post({
          text: "Please select your company context to proceed",
          blocks: [
            { type: "header", text: { type: "plain_text", text: "Select Company", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: "Choose the company you want to use with this bot:" } },
            { type: "actions", elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Choose company", emoji: true },
                style: "primary",
                action_id: "open_company_picker",
                value: JSON.stringify({ userId: String(user.userId), slackUserId, channelId })
              }
            ]},
            { type: "context", elements: [ { type: "mrkdwn", text: "You can change this later by typing `change company`." } ] }
          ],
        });
      }
      // Stop processing until user selects a company
      if (onDeny) onDeny();
      return null;
    }
  } catch (e) {
    console.error("Error during company selection prompt:", e);
    if (client && channel) {
      const post = async (payload) => slackUserId
        ? client.chat.postEphemeral({ channel, user: slackUserId, ...payload })
        : client.chat.postMessage({ channel, ...payload });
      await post({ text: "Unexpected error while preparing your session. Please try again." });
    }
    if (onDeny) onDeny();
    return null;
  }

  // Fallback: no slackUserId provided, proceed
  // Silent proceed
  return user.userId;
};

module.exports = { requireUserAuthentication };
