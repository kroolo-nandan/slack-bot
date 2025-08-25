#!/usr/bin/env node

// Enhanced Bot Starter with Socket Mode Error Handling
// This script provides better error handling and automatic restart capabilities

const { spawn } = require('child_process');
const path = require('path');

class BotManager {
  constructor() {
    this.process = null;
    this.restartCount = 0;
    this.maxRestarts = 5;
    this.restartDelay = 5000; // 5 seconds
    this.isShuttingDown = false;
  }

  start() {
    console.log('🚀 Starting Slack API Query Bot...');
    
    const appPath = path.join(__dirname, '..', 'app.js');
    
    this.process = spawn('node', [appPath], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    this.process.on('exit', (code, signal) => {
      if (this.isShuttingDown) {
        console.log('✅ Bot stopped gracefully');
        return;
      }

      console.log(`\n⚠️ Bot process exited with code ${code} and signal ${signal}`);
      
      if (code === 1 && this.restartCount < this.maxRestarts) {
        this.restartCount++;
        console.log(`🔄 Attempting restart ${this.restartCount}/${this.maxRestarts} in ${this.restartDelay/1000} seconds...`);
        
        setTimeout(() => {
          this.start();
        }, this.restartDelay);
      } else if (this.restartCount >= this.maxRestarts) {
        console.error('❌ Maximum restart attempts reached. Please check the logs and fix any issues.');
        process.exit(1);
      } else {
        console.log('✅ Bot stopped normally');
      }
    });

    this.process.on('error', (error) => {
      console.error('❌ Failed to start bot process:', error);
    });

    // Reset restart count on successful run (after 30 seconds)
    setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.log('✅ Bot running successfully, resetting restart counter');
        this.restartCount = 0;
      }
    }, 30000);
  }

  stop() {
    console.log('\n🛑 Stopping bot...');
    this.isShuttingDown = true;
    
    if (this.process) {
      this.process.kill('SIGTERM');
      
      // Force kill after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log('⚠️ Force killing bot process...');
          this.process.kill('SIGKILL');
        }
      }, 10000);
    }
  }
}

// Create bot manager instance
const botManager = new BotManager();

// Handle process signals
process.on('SIGINT', () => {
  botManager.stop();
});

process.on('SIGTERM', () => {
  botManager.stop();
});

// Start the bot
console.log('🎯 Slack API Query Bot Manager');
console.log('   This script provides enhanced error handling for Socket Mode connections');
console.log('   Press Ctrl+C to stop the bot\n');

botManager.start();
