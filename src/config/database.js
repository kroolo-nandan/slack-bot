// MongoDB Database Configuration
// Handles connection setup and configuration for the Slack Enterprise Search Bot

const mongoose = require('mongoose');
require('dotenv').config();

class DatabaseConfig {
  constructor() {
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/slack-enterprise-search';
    this.isConnected = false;
    this.connectionOptions = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds
    };

    console.log('🔧 Database Configuration initialized');
    console.log(`   Connection String: ${this.connectionString.replace(/\/\/.*@/, '//***:***@')}`);
  }

  // Connect to MongoDB
  async connect() {
    try {
      console.log('🔄 Connecting to MongoDB...');
      
      await mongoose.connect(this.connectionString, this.connectionOptions);
      
      this.isConnected = true;
      console.log('✅ MongoDB connected successfully');
      console.log(`   Database: ${mongoose.connection.name}`);
      console.log(`   Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
      
      // Set up connection event listeners
      this.setupEventListeners();
      
      return true;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  // Setup connection event listeners
  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      console.log('📡 MongoDB connection established');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error.message);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      this.isConnected = false;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  // Disconnect from MongoDB
  async disconnect() {
    try {
      if (this.isConnected) {
        console.log('🔄 Disconnecting from MongoDB...');
        await mongoose.connection.close();
        this.isConnected = false;
        console.log('✅ MongoDB disconnected successfully');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error.message);
    }
  }

  // Check connection status
  isConnectionHealthy() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  // Get connection info
  getConnectionInfo() {
    if (!this.isConnected) {
      return {
        status: 'disconnected',
        database: null,
        host: null,
        port: null
      };
    }

    return {
      status: 'connected',
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      readyState: mongoose.connection.readyState,
      collections: Object.keys(mongoose.connection.collections)
    };
  }

  // Test database connection
  async testConnection() {
    try {
      console.log('🧪 Testing database connection...');
      
      if (!this.isConnected) {
        await this.connect();
      }

      // Perform a simple operation to test the connection
      await mongoose.connection.db.admin().ping();
      
      console.log('✅ Database connection test successful');
      return {
        success: true,
        message: 'Database connection is healthy',
        info: this.getConnectionInfo()
      };
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      return {
        success: false,
        message: error.message,
        info: this.getConnectionInfo()
      };
    }
  }

  // Initialize database with indexes and setup
  async initialize() {
    try {
      console.log('🔄 Initializing database...');
      
      if (!this.isConnected) {
        await this.connect();
      }

      // Create indexes for better performance
      const User = require('../models/User');
      const Connection = require('../models/Connection');

      // Ensure indexes are created
     await User.createIndexes();
     await Connection.createIndexes();
 

      console.log('✅ Database initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

module.exports = databaseConfig;
