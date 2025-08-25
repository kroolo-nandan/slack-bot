#!/bin/bash

# Quick Start Script for Slack API Query Bot
# This script helps you get started quickly

echo "🚀 Slack API Query Bot - Quick Start"
echo "===================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm found: $(npm --version)"

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
else
    echo "✅ Dependencies already installed"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "🔧 IMPORTANT: You need to edit the .env file with your Slack tokens!"
    echo "   1. Follow the SETUP_GUIDE.md to create your Slack app"
    echo "   2. Update .env with your actual tokens"
    echo "   3. Run this script again"
    echo ""
    echo "📖 Opening setup guide..."
    if command -v open &> /dev/null; then
        open SETUP_GUIDE.md
    elif command -v xdg-open &> /dev/null; then
        xdg-open SETUP_GUIDE.md
    else
        echo "   Please read SETUP_GUIDE.md manually"
    fi
    exit 0
else
    echo "✅ .env file exists"
fi

# Check if Slack tokens are configured
if grep -q "xoxb-your-bot-token-here" .env; then
    echo "⚠️  Slack tokens not configured yet"
    echo "   Please update your .env file with real Slack tokens"
    echo "   Follow SETUP_GUIDE.md for instructions"
    exit 0
fi

echo "✅ Slack tokens appear to be configured"

# Test the bot functionality
echo ""
echo "🧪 Testing bot functionality..."
node test-bot.js

if [ $? -ne 0 ]; then
    echo "❌ Bot tests failed"
    exit 1
fi

echo ""
echo "🎉 Everything looks good!"
echo ""
echo "🚀 Ready to start your bot!"
echo "   Run: npm run dev"
echo ""
echo "📚 Useful commands:"
echo "   npm run dev     - Start the bot in development mode"
echo "   npm start       - Start the bot in production mode"
echo "   node test-bot.js - Test bot functionality"
echo ""
echo "📖 Documentation:"
echo "   README.md       - Project overview"
echo "   SETUP_GUIDE.md  - Detailed setup instructions"
echo "   DEPLOYMENT.md   - Production deployment guide"
echo ""
echo "💡 Next steps:"
echo "   1. Run 'npm run dev' to start your bot"
echo "   2. Test it in Slack by mentioning @your-bot-name"
echo "   3. Configure your real APIs in src/config/apis.js"
echo "   4. Deploy to production when ready"
echo ""
echo "Happy coding! 🎉"
