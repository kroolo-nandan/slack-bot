// Enterprise Search API Configuration
// Aligns with FastAPI backend endpoints defined in `final_complete/fastapi_main.py`

const API_ENDPOINTS = {
  search: {
    endpoint: '/search',
    method: 'POST',
    description: 'Search documents (body: user_query)',
    parameters: ['user_query'],
    keywords: ['search', 'find', 'look', 'query', 'documents', 'files'],
    requiresAuth: false
  },
  'search-analytics': {
    endpoint: '/api/search-analytics',
    method: 'POST',
    description: 'Aggregate analytics across searches (body: company_id, user_email)',
    parameters: [],
    keywords: ['analytics', 'metrics', 'stats', 'search analytics'],
    requiresAuth: true
  },
  'trending-searches': {
    endpoint: '/api/trending-searches',
    method: 'POST',
    description: 'Popular searches (body: company_id, user_email)',
    parameters: [],
    keywords: ['trending searches', 'top queries', 'popular searches'],
    requiresAuth: true
  },
  'recent-searches': {
    endpoint: '/api/recent-searches',
    method: 'POST',
    description: 'Recent searches (body: company_id, user_email)',
    parameters: [],
    keywords: ['recent', 'history', 'previous', 'last', 'searches'],
    requiresAuth: true
  },
  'suggested-documents': {
    endpoint: '/api/suggested-documents',
    method: 'POST',
    description: 'Suggested documents (body: company_id, user_email)',
    parameters: [],
    keywords: ['suggested', 'recommended', 'documents', 'files'],
    requiresAuth: true
  },
  'trending-documents': {
    endpoint: '/api/trending-documents',
    method: 'POST',
    description: 'Trending documents (body: limit, company_id, user_email)',
    parameters: ['limit'],
    keywords: ['trending', 'popular', 'hot', 'documents', 'files', 'analytics'],
    requiresAuth: true
  },
  // Not backed by backend endpoint; handled locally in apiService
  'dynamic-suggestions': {
    endpoint: null,
    method: 'LOCAL',
    description: 'Local autocomplete suggestions (no backend call)',
    parameters: ['partial_query', 'limit'],
    keywords: ['suggestions', 'autocomplete', 'complete', 'suggest'],
    requiresAuth: false
  }
};

// Natural language patterns to API mapping for Enterprise Search
const QUERY_PATTERNS = [
  {
    pattern: /(?:search|find|look)\s+(?:for\s+)?(.+)/i,
    api: 'search',
    paramExtractor: (match) => ({
      user_query: match[1].trim()
    })
  },
  {
    pattern: /(?:show\s+)?(?:me\s+)?(?:my\s+)?recent\s+searches?/i,
    api: 'recent-searches',
    paramExtractor: () => ({ limit: 10 })
  },
  {
    pattern: /(?:show\s+)?(?:me\s+)?suggested?\s+(?:documents?|files?)/i,
    api: 'suggested-documents',
    paramExtractor: () => ({ limit: 10 })
  },
  {
    pattern: /(?:show\s+)?(?:me\s+)?trending\s+(?:documents?|files?)/i,
    api: 'trending-documents',
    paramExtractor: () => ({ limit: 10 })
  },
  {
    pattern: /(?:suggest|complete|autocomplete)\s+(.+)/i,
    api: 'dynamic-suggestions',
    paramExtractor: (match) => ({
      partial_query: match[1].trim(),
      limit: 10
    })
  },
  {
    pattern: /(?:what's\s+)?(?:popular|trending|hot)\s+(?:now|today)?/i,
    api: 'trending-documents',
    paramExtractor: () => ({ limit: 10 })
  },
  {
    pattern: /(?:discover|show|get)\s+trending\s+documents?/i,
    api: 'trending-documents',
    paramExtractor: () => ({ limit: 10 })
  },
  {
    pattern: /(?:recommend|suggestions?)\s+(?:for\s+)?(.+)/i,
    api: 'dynamic-suggestions',
    paramExtractor: (match) => ({
      partial_query: match[1].trim(),
      limit: 10
    })
  }
];

// Legacy RBAC placeholders retained for compatibility with some UI flows.
// Backend auth is now via headers: company_id, user_email.
const RBAC_CONFIG = {
  account_ids: [],
  external_user_id: null,
  user_email: null
};

// Default apps for search queries (unused by backend; kept for NLP/UI defaults)
const DEFAULT_APPS = ["google_drive", "slack", "dropbox", "jira", "zendesk", "document360"];

module.exports = {
  API_ENDPOINTS,
  QUERY_PATTERNS,
  RBAC_CONFIG,
  DEFAULT_APPS
};
