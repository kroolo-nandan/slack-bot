const axios = require('axios');
const { API_ENDPOINTS, DEFAULT_APPS } = require('../config/apis');
const { getUserConnections } = require('./databaseService');

require('dotenv').config();

class ApiService {
  constructor() {
    console.log('🔍 Environment check:');
    console.log(' NODE_ENV:', process.env.NODE_ENV);
    console.log(' FASTAPI_BACKEND_URL from env:', process.env.FASTAPI_BACKEND_URL);
    console.log(' All env keys containing API:', Object.keys(process.env).filter(key => key.includes('API')));

    const rawBase = process.env.FASTAPI_BACKEND_URL || process.env.API_BASE_URL || '';
    this.baseURL = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

    console.log('🔧 API Service initialized with baseURL:', this.baseURL);

    this.searchCache = new Map();
    this.cacheTTLms = parseInt(process.env.SEARCH_CACHE_TTL_MS, 10) || 5 * 60 * 1000; // ✅ FIXED: No escaped chars

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Slack-API-Query-Bot/1.0'
      }
    });

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
      const apiConfig = API_ENDPOINTS[apiName]; // ✅ FIXED: No escaped chars
      if (!apiConfig) {
        return { error: `Unknown API: ${apiName}` };
      }

      if (apiConfig.method === 'LOCAL') {
        return this.handleLocalEndpoint(apiName, parameters);
      }

      // ✅ Use streaming handler for search requests
      if (apiName === 'search') {
        console.log('🔄 Using streaming search handler...');
        return await this.handleStreamingSearch(parameters, slackUserId, slackEmail, "Abhishek");
      }

      // Rest of your non-search API logic here...
      return { error: 'Non-search APIs not implemented in this snippet' };

    } catch (error) {
      console.error('❌ API Error:', error.response?.data || error.message);
      return {
        error: `API Error: ${error.message}`,
        status: error.response?.status,
        details: error.response?.data || error.message
      };
    }
  }

 async handleStreamingSearch(parameters, slackUserId, slackEmail, companyId) {
  try {
    const uq = (parameters.user_query || parameters.query || '').toString().trim().toLowerCase();
    if (uq) {
      const key = `search::${uq}`;
      const cached = this.searchCache.get(key);
      const now = Date.now();
      if (cached && (now - cached.timestamp) < this.cacheTTLms) {
        console.log(`🗃️ Using cached result for query: "${uq}"`);
        return { data: cached.data, status: cached.status, headers: cached.headers, cached: true };
      }
    }

    const requestConfig = {
      method: 'post',
      url: '/search',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      timeout: 30000
    };

    const body = {
      user_query: parameters.user_query || parameters.query || '',
      user_email: slackEmail || 'nandanks010@gmail.com',
      user_id: parameters.user_id || slackUserId || 'U094A1BNHE0',
      company_id: companyId || "Abhishek"
    };

    requestConfig.data = body;
    console.log('➡️ Streaming Search Request:', JSON.stringify(body, null, 2));

    const response = await this.client(requestConfig);

    return new Promise((resolve, reject) => {
      let chunks = [];
      let finalResult = null;
      let retrievedData = [];
      let buffer = '';
      
      // ✅ ADD: Variables to collect AI response
      let aiResponseParts = [];
      let completeAiResponse = '';

      response.data.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        console.log('🔍 RAW CHUNK SIZE:', chunkStr.length, 'bytes');
        
        buffer += chunkStr;
        
        // ✅ Extract complete JSON objects from buffer
        this.extractCompleteJsonObjects(buffer, (completeJson, remainingBuffer) => {
          buffer = remainingBuffer;
          
          for (const jsonObj of completeJson) {
            try {
              console.log('📦 Complete JSON object:', jsonObj.event || 'unknown event');
              chunks.push(jsonObj);

              // ✅ EXISTING: Process RetrievedData (search results)
              if (jsonObj.event === 'RetrievedData' || 
                  jsonObj.event === 'RetreivedData' ||
                  (jsonObj.event && jsonObj.event.includes('Retrieved'))) {
                
                console.log('🎉 MATCHED RetrievedData event!');
                console.log('  - Exact event name:', `"${jsonObj.event}"`);
                console.log('  - Has content:', !!jsonObj.content);
                
                if (jsonObj.content) {
                  console.log('  - Content type:', typeof jsonObj.content);
                  console.log('  - Content length:', jsonObj.content.length);
                  
                  try {
                    const parsedContent = JSON.parse(jsonObj.content);
                    console.log('  ✅ JSON parsing successful!');
                    console.log('  - Parsed keys:', Object.keys(parsedContent));
                    
                    if (parsedContent.results) {
                      console.log(`  🚀 EUREKA! Found ${parsedContent.results.length} results!`);
                      retrievedData.push(...parsedContent.results);
                      console.log(`  ✅ Added to retrievedData. Total now: ${retrievedData.length}`);
                    }
                  } catch (parseError) {
                    console.error('  ❌ Parse error:', parseError.message);
                  }
                }
              }

              // ✅ NEW: Collect AI response content from streaming events
              if (jsonObj.event === 'RunResponseContent' && jsonObj.content) {
                aiResponseParts.push(jsonObj.content);
                console.log('📝 AI Response part:', `"${jsonObj.content}"`);
              }

              // ✅ UPDATED: Get complete AI response from RunCompleted
              if (jsonObj.event === 'RunCompleted') {
                finalResult = jsonObj;
                completeAiResponse = jsonObj.content || aiResponseParts.join('');
                console.log('🏁 Run completed event received');
                console.log('🤖 Complete AI Response:', completeAiResponse);
              }

            } catch (e) {
              console.warn('❌ Failed to process JSON object:', e.message);
              console.log('  - Object that failed:', JSON.stringify(jsonObj).substring(0, 200));
            }
          }
        });
      });

      response.data.on('end', () => {
        console.log(`🏁 Stream ended. Processed ${chunks.length} events, ${retrievedData.length} results`);
        console.log(`🤖 Final AI Response: "${completeAiResponse}"`);
        
        const processedResult = {
          success: true,
          results: retrievedData.map(result => ({
            title: result.metadata?.title || 'Untitled',
            // ✅ IMPROVED: Use metadata for better content preview
            content_preview: result.metadata?.breadcrumb || 
               (result.metadata?.project_key && result.metadata?.issue_key ? 
                `${result.metadata.project_key}-${result.metadata.issue_key}` : null) ||
               result.content || 
             'No preview available',

            url: result.metadata?.url || '',
            platform: result.metadata?.datasource || 'unknown',
            similarity_score: result.similarity_score || 0,
            metadata: result.metadata || {},
            file_name: result.metadata?.title || 'Untitled',
            document_type: result.metadata?.mime_type || 'Document',
            score: result.similarity_score || 0,
            connector_type: result.metadata?.datasource || 'unknown'
          })),
          total_results: retrievedData.length,
          user_query: body.user_query,
          query: body.user_query,
          // ✅ USE: Complete AI response as summary
          summary: completeAiResponse || `Found ${retrievedData.length} results for "${body.user_query}"`,
          ai_response: completeAiResponse, // ✅ ADD: Separate field for AI response
          response_time: 0,
          search_method: 'streaming_json_objects',
          search_type: 'streaming_json_objects'
        };

        console.log('📊 Final processed result:', {
          total_results: processedResult.total_results,
          has_results: processedResult.results.length > 0,
          first_result_title: processedResult.results[0]?.title || 'N/A',
          ai_response_length: completeAiResponse.length
        });

        if (body.user_query && uq) {
          const cacheKey = `search::${uq}`;
          this.searchCache.set(cacheKey, {
            data: processedResult,
            status: 200,
            headers: {},
            timestamp: Date.now()
          });
        }

        resolve({
          data: processedResult,
          status: 200,
          streaming: true
        });
      });

      response.data.on('error', (error) => {
        console.error('❌ Stream error:', error);
        reject(error);
      });

      setTimeout(() => {
        console.error('⏰ Streaming request timed out');
        reject(new Error('Streaming request timed out'));
      }, 35000);
    });

  } catch (error) {
    console.error('❌ Streaming search error:', error);
    return {
      error: `Streaming search failed: ${error.message}`,
      status: error.response?.status || 500
    };
  }
}


  // ✅ FIXED: Extract complete JSON objects helper
  extractCompleteJsonObjects(buffer, callback) {
    const completeObjects = [];
    let workingBuffer = buffer;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let objectStart = -1;

    for (let i = 0; i < workingBuffer.length; i++) {
      const char = workingBuffer[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{') {
        if (braceCount === 0) {
          objectStart = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (braceCount === 0 && objectStart !== -1) {
          const jsonStr = workingBuffer.substring(objectStart, i + 1);
          try {
            const jsonObj = JSON.parse(jsonStr);
            completeObjects.push(jsonObj);
          } catch (e) {
            console.warn('Failed to parse extracted JSON:', e.message);
          }
          objectStart = -1;
        }
      }
    }
    
    let remainingBuffer = '';
    if (objectStart !== -1) {
      remainingBuffer = workingBuffer.substring(objectStart);
    } else {
      const lastCompleteEnd = workingBuffer.lastIndexOf('}');
      if (lastCompleteEnd !== -1) {
        remainingBuffer = workingBuffer.substring(lastCompleteEnd + 1);
      } else {
        remainingBuffer = workingBuffer;
      }
    }
    
    callback(completeObjects, remainingBuffer);
  }

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
