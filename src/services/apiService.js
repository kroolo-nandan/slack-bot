const axios = require('axios');
const { API_ENDPOINTS, DEFAULT_APPS } = require('../config/apis');
const { getUserConnections } = require('./databaseService');

// Ensure dotenv is loaded
require('dotenv').config();

class ApiService {
  constructor() {
    // Debug environment variables
    console.log('🔍 Environment check:');
    console.log('   NODE_ENV:', process.env.NODE_ENV);
    console.log('   FASTAPI_BACKEND_URL from env:', process.env.FASTAPI_BACKEND_URL);
    console.log('   All env keys containing API:', Object.keys(process.env).filter(key => key.includes('API')));

    const rawBase = process.env.FASTAPI_BACKEND_URL || process.env.API_BASE_URL || '';
    // Normalize base URL: remove trailing slash to avoid double slash when joining
    this.baseURL = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
    console.log('🔧 API Service initialized with baseURL:', this.baseURL);

    // Simple in-memory cache for search
    this.searchCache = new Map();
    this.cacheTTLms = parseInt(process.env.SEARCH_CACHE_TTL_MS, 10) || 5 * 60 * 1000; // default 5 minutes

    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 20000, // 20 second timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Slack-API-Query-Bot/1.0'
      }
    });

    // Auth is provided via headers: company_id, user_email (FastAPI require_auth)

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async callAPI(apiName, parameters = {}, slackUserId = null, slackEmail = null, companyId = null) {
    try {
      const apiConfig = API_ENDPOINTS[apiName];
      if (!apiConfig) {
        return { error: `Unknown API: ${apiName}` };
      }

      // Handle LOCAL endpoints without backend calls (e.g., dynamic-suggestions)
      if (apiConfig.method === 'LOCAL') {
        return this.handleLocalEndpoint(apiName, parameters);
      }

      const requestConfig = {
        method: apiConfig.method.toLowerCase(),
        url: apiConfig.endpoint,
        headers: {}
      };

      // SEARCH CACHE: if requesting 'search', check cache by normalized user_query
      if (apiName === 'search') {
        const uq = (parameters.user_query || parameters.query || '').toString().trim().toLowerCase();
        if (uq) {
          const key = `search::${uq}`;
          const cached = this.searchCache.get(key);
          const now = Date.now();
          if (cached && (now - cached.timestamp) < this.cacheTTLms) {
            console.log(`🗃️ Using cached result for query: "${uq}" (age ${now - cached.timestamp} ms)`);
            // Return a shallow clone to avoid accidental mutations
            return { data: cached.data, status: cached.status, headers: cached.headers, cached: true };
          }
        }
      }

      // Determine company id to embed into request body
      const resolvedCompanyId = companyId ?? process.env.COMPANY_ID ?? process.env.DEFAULT_COMPANY_ID ?? null;
      const resolvedCompanyIdStr = resolvedCompanyId != null ? String(resolvedCompanyId) : null;
      if (apiConfig.requiresAuth) {
        if (!slackEmail) {
          return { error: 'Missing slackEmail for authenticated request' };
        }
        if (!resolvedCompanyIdStr) {
          return { error: 'Missing companyId for authenticated request' };
        }
      }

      // Configure request based on endpoint and method
      if (apiConfig.method.toLowerCase() === 'get') {
        // Keep support for any legacy GET endpoints if present
        const qs = this.cleanParameters(parameters);
        requestConfig.params = qs;
      } else {
        // POST endpoints: only include whitelisted params + RBAC fields
        const body = {};
        const allowed = Array.isArray(apiConfig.parameters) ? apiConfig.parameters : [];
        for (const key of allowed) {
          if (parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '') {
            body[key] = parameters[key];
          }
        }
        // Defensive mapping for search: accept legacy 'query' and map to 'user_query'
        if (apiName === 'search') {
          if (!body.user_query && (parameters.query || parameters.user_query)) {
            body.user_query = parameters.user_query || parameters.query;
          }
        }
        if (apiConfig.requiresAuth) {
          body.company_id = resolvedCompanyIdStr; // ensure string
          body.user_email = (slackEmail || '').toLowerCase();
        }
        // For 'search', backend expects only { user_query } now. Do not add defaults.
        requestConfig.data = body;
      }

      if (requestConfig.url.includes('{') && requestConfig.url.includes('}')) {
        requestConfig.url = this.replacePathParameters(requestConfig.url, parameters);
      }
      
      // Log the outgoing request for debugging
      try {
        const fullUrl = `${this.baseURL}${requestConfig.url.startsWith('/') ? '' : '/'}${requestConfig.url}`;
        if (requestConfig.method === 'post') {
          console.log('➡️  API Request:', requestConfig.method?.toUpperCase(), fullUrl);
          console.log('🧾 Request Body:', JSON.stringify(requestConfig.data || {}, null, 2));
        } else {
          console.log('➡️  API Request:', requestConfig.method?.toUpperCase(), fullUrl, 'params:', requestConfig.params || {});
        }
      } catch (_) { /* ignore logging errors */ }

      // Simple retry on timeout/ECONNABORTED
      const maxRetries = 2;
      let attempt = 0;
      let response;
      while (true) {
        try {
          response = await this.client(requestConfig);
          break;
        } catch (err) {
          const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
          if (isTimeout && attempt < maxRetries) {
            attempt += 1;
            const delayMs = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms
            await new Promise(res => setTimeout(res, delayMs));
            // On retries, bump timeout a bit
            const currTimeout = requestConfig.timeout || this.client.defaults.timeout || 20000;
            requestConfig.timeout = currTimeout + 5000; // add 5s per retry
            continue;
          }
          throw err;
        }
      }
      // If backend sometimes returns a JSON-encoded string, parse it
      if (response && typeof response.data === 'string') {
        try {
          const maybe = JSON.parse(response.data);
          response.data = maybe;
        } catch (_) {
          // keep as-is
        }
      }
      console.log('\n📋 Complete Response Data:');
      console.log(JSON.stringify(response.data, null, 2));
      console.log('===== API SERVICE COMPLETE =====\n');

      // Populate cache for 'search'
      if (apiName === 'search') {
        const uq = ((requestConfig.data && requestConfig.data.user_query) || '').toString().trim().toLowerCase();
        if (uq) {
          const key = `search::${uq}`;
          this.searchCache.set(key, { data: response.data, status: response.status, headers: response.headers, timestamp: Date.now() });
        }
      }
      return {
        data: response.data,
        status: response.status,
        headers: response.headers
      };

    } catch (error) {
      const errRes = error.response;
      const status = errRes?.status;
      const message = errRes?.data?.message || error.message;

      return {
        error: `API Error${status ? ` (${status})` : ''}: ${message}`,
        status,
        details: errRes?.data || error.message
      };
    }
  }

  cleanParameters(parameters) {
    // Remove undefined/null values and empty strings
    const cleaned = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null && value !== '') {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  replacePathParameters(url, parameters) {
    let processedUrl = url;

    // Replace path parameters like {userId} with actual values
    const pathParamRegex = /\{(\w+)\}/g;
    let match;

    while ((match = pathParamRegex.exec(url)) !== null) {
      const paramName = match[1];
      const paramValue = parameters[paramName];

      if (paramValue) {
        processedUrl = processedUrl.replace(`{${paramName}}`, paramValue);
      }
    }

    return processedUrl;
  }

  // Handle endpoints that are LOCAL (no backend call), e.g., dynamic-suggestions
  handleLocalEndpoint(apiName, parameters) {
    if (apiName === 'dynamic-suggestions') {
      const partial = (parameters.partial_query || '').trim();
      if (!partial) {
        return { data: { status: 'success', suggestions: [], count: 0 }, status: 200 };
      }
      const bases = [partial, partial.toLowerCase(), this.toTitleCase(partial)];
      const suffixes = [' guide', ' docs', ' policy', ' SOP', ' checklist'];
      const suggestions = Array.from(new Set(bases.flatMap(b => [''].concat(suffixes).map(s => (b + s).trim()))));
      return { data: { status: 'success', suggestions: suggestions.slice(0, parameters.limit || 10), count: Math.min(suggestions.length, parameters.limit || 10) }, status: 200 };
    }
    return { error: `No LOCAL handler for ${apiName}` };
  }

  toTitleCase(s) {
    return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  async testConnection() {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return {
        success: true,
        status: response.status,
        message: 'API connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to API'
      };
    }
  }

  async getApiInfo() {
    const info = {
      baseURL: this.baseURL,
      authMethod: 'RBAC in request body (no headers needed)',
      availableEndpoints: Object.keys(API_ENDPOINTS),
      endpointDetails: API_ENDPOINTS
    };

    return info;
  }

  // Utility helpers for cache management
  clearSearchCache(query = null) {
    if (!query) {
      this.searchCache.clear();
      console.log('🧹 Cleared entire search cache');
      return;
    }
    const uq = String(query).trim().toLowerCase();
    const key = `search::${uq}`;
    this.searchCache.delete(key);
    console.log(`🧹 Cleared search cache for query: "${uq}"`);
  }

  getSearchCacheStats() {
    return {
      size: this.searchCache.size,
      ttl_ms: this.cacheTTLms
    };
  }
}

module.exports = new ApiService();
