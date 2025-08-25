// Simplified Query Handler - Unified Intent Engine Approach

const apiService = require('../services/apiService');
const nlpService = require('../services/nlpService');

class QueryHandler {
  formatLegacyApiResponse(apiResponse, apiType, parameters, duration, nlpResult) {
  // Handle API errors
  if (apiResponse.error) {
    console.log('❌ API call failed');
    console.log('💥 API Error:', apiResponse.error);
    console.log('⏱️ API Call Duration:', duration, 'ms');
    return {
      error: apiResponse.error
    };
  }

  console.log('✅ API call completed');
  console.log('⏱️ API Call Duration:', duration, 'ms');
  console.log('📊 API Response Status:', apiResponse.status || 'Success');

  // Log response summary based on API type
  if (apiResponse.data) {
    if (apiResponse.data.results) {
      console.log('📄 Results Found:', apiResponse.data.results.length);
    } else if (apiResponse.data.data) {
      console.log('📄 Data Items:', Array.isArray(apiResponse.data.data) ? apiResponse.data.data.length : 'Object');
    } else if (apiResponse.data.trending_documents) {
      console.log('📄 Trending Documents:', apiResponse.data.trending_documents.length);
    } else if (apiResponse.data.suggested_documents) {
      console.log('📄 Suggested Documents:', apiResponse.data.suggested_documents.length);
    }
  }

  // Step 4: Prepare final response in legacy format
  console.log('\n🎉 Preparing final response in legacy format...');
  // Attach query context into data so downstream formatters can access it (e.g., Show more payloads)
  try {
    if (apiType === 'search' && apiResponse && apiResponse.data && !apiResponse.data.user_query) {
      const uq = (parameters && (parameters.user_query || parameters.query)) || '';
      if (uq) apiResponse.data.user_query = uq;
    }
  } catch (_) {}

  const finalResponse = {
    data: apiResponse.data,
    apiUsed: apiType,
    parameters: parameters,
    confidence: nlpResult.confidence,
    method: nlpResult.provider === 'openai' ? 'ai_powered' : 'pattern_matching',
    aiProvider: nlpResult.provider || 'OpenAI NLP',
    reasoning: nlpResult.reasoning
  };

  console.log('✅ QUERY PROCESSING COMPLETE');
  console.log('🏁 Final Response Ready for Slack formatting');
  
  return finalResponse;
}

  async processQuery(query, userContext = null) {
    try {
      console.log('\n🚀 ===== UNIFIED INTENT ENGINE QUERY PROCESSING =====');
      console.log('📝 Original Query:', `"${query}"`);
      console.log('👤 User Context:', userContext ? 'Available' : 'None');
      console.log('⏰ Timestamp:', new Date().toISOString());

      // Extract slackUserId for backward compatibility
      const slackUserId = userContext?.slackUserId || userContext;

      // Step 1: Parse query through unified NLP service
      console.log('\n🧠 STEP 1: Processing through Intent Engine...');
      const nlpResult = await nlpService.parseQuery(query);
      
      if (!nlpResult || !nlpResult.action) {
        console.log('❌ STEP 1 FAILED: Intent Engine could not process query');
        return {
          error: "I couldn't understand your request. Please try rephrasing it or ask me to 'connect gmail', 'search for documents', or 'show my connections'."
        };
      }

      console.log('✅ STEP 1 SUCCESS: Intent Engine processed query');
      console.log('🎯 Intent:', nlpResult.intent);
      console.log('🏷️ Domain:', nlpResult.domain || 'None');
      console.log('⚡ Action:', nlpResult.action);
      console.log('📊 Confidence:', nlpResult.confidence);
      console.log('📋 Parameters:', JSON.stringify(nlpResult.parameters, null, 2));

      // Step 2: Handle general conversation
      if (nlpResult.intent === 'general') {
        console.log('💬 STEP 2: Handling general conversation');
        return {
          message: nlpResult.parameters.message,
          type: 'conversational',
          confidence: nlpResult.confidence,
          intent: nlpResult.intent,
          provider: nlpResult.provider
        };
      }

      // Step 3: Dispatch to appropriate handler based on action
      console.log('\n⚡ STEP 2: Dispatching to action handler...');
      console.log('🎯 Action to execute:', nlpResult.action);

      switch (nlpResult.action) {
        case 'initiateCompanyChange':
          console.log('🔁 Executing: Initiate Company Change');
          return {
            intent: 'change_company',
            action: 'initiateCompanyChange',
            type: 'control',
            parameters: nlpResult.parameters,
            confidence: nlpResult.confidence
          };

        // API-related actions returning legacy format:

        case 'callSearchApi':
          console.log('🔍 Executing: Search API Call');
          const searchStartTime = Date.now();
          // Normalize to { user_query }
          const userQuery = (nlpResult.parameters && (nlpResult.parameters.user_query || nlpResult.parameters.query)) || query || '';
          const searchPayload = { user_query: userQuery };
          console.log('📦 Search Payload:', JSON.stringify(searchPayload));
          const searchResponse = await apiService.callAPI(
            'search',
            searchPayload,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const searchDuration = Date.now() - searchStartTime;
          
          return this.formatLegacyApiResponse(searchResponse, 'search', searchPayload, searchDuration, nlpResult);

        case 'getSearchAnalytics':
          console.log('📈 Executing: Search Analytics');
          const analyticsStart = Date.now();
          const analyticsResponse = await apiService.callAPI(
            'search-analytics',
            nlpResult.parameters,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const analyticsDuration = Date.now() - analyticsStart;
          return this.formatLegacyApiResponse(analyticsResponse, 'search-analytics', nlpResult.parameters, analyticsDuration, nlpResult);

        case 'getRecentSearches':
          console.log('📋 Executing: Get Recent Searches');
          const recentStartTime = Date.now();
          const recentResponse = await apiService.callAPI(
            'recent-searches',
            nlpResult.parameters,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const recentDuration = Date.now() - recentStartTime;
          
          return this.formatLegacyApiResponse(recentResponse, 'recent-searches', nlpResult.parameters, recentDuration, nlpResult);

        case 'getTrendingSearches':
          console.log('📈 Executing: Get Trending Searches');
          const trSearchStart = Date.now();
          const trSearchResponse = await apiService.callAPI(
            'trending-searches',
            nlpResult.parameters,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const trSearchDuration = Date.now() - trSearchStart;
          return this.formatLegacyApiResponse(trSearchResponse, 'trending-searches', nlpResult.parameters, trSearchDuration, nlpResult);

        case 'getSuggestedDocuments':
          console.log('💡 Executing: Get Suggested Documents');
          const suggestedStartTime = Date.now();
          const suggestedResponse = await apiService.callAPI(
            'suggested-documents',
            nlpResult.parameters,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const suggestedDuration = Date.now() - suggestedStartTime;
          
          return this.formatLegacyApiResponse(suggestedResponse, 'suggested-documents', nlpResult.parameters, suggestedDuration, nlpResult);

        case 'getTrendingDocuments':
          console.log('📈 Executing: Get Trending Documents');
          const trendingStartTime = Date.now();
          const trendingResponse = await apiService.callAPI(
            'trending-documents',
            nlpResult.parameters,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const trendingDuration = Date.now() - trendingStartTime;
          
          return this.formatLegacyApiResponse(trendingResponse, 'trending-documents', nlpResult.parameters, trendingDuration, nlpResult);

        case 'getDynamicSuggestions':
          console.log('🔮 Executing: Get Dynamic Suggestions');
          const dynamicStartTime = Date.now();
          const dynamicResponse = await apiService.callAPI(
            'dynamic-suggestions',
            nlpResult.parameters,
            slackUserId,
            userContext?.slackEmail,
            userContext?.companyId
          );
          const dynamicDuration = Date.now() - dynamicStartTime;
          
          return this.formatLegacyApiResponse(dynamicResponse, 'dynamic-suggestions', nlpResult.parameters, dynamicDuration, nlpResult);


        default:
          console.log('❌ Unknown action:', nlpResult.action);
          return {
            error: `Unsupported action: ${nlpResult.action}. Please try rephrasing your request.`
          };
      }

    } catch (error) {
      console.error('❌ Error in unified query processing:', error);
      return {
        error: `Failed to process query: ${error.message}`
      };
    }
  }
  // Removed tool connection and status handlers as per new scope

  // Simplified method for getting service info
  getServiceInfo() {
    return {
      version: '2.0.0',
      approach: 'unified_intent_engine',
      nlpProvider: nlpService.getProviderStatus(),
      features: [
        'Direct query to NLP service',
        'Intent-based action mapping',
        'Unified parameter extraction',
        'Enterprise search integration'
      ],
      supportedIntents: [
        'search', 'search_analytics', 'trending_searches',
        'recent_searches', 'suggested_documents', 
        'trending_documents', 'dynamic_suggestions', 'general'
      ],
      supportedTools: []
    };
  }
}

module.exports = new QueryHandler();
