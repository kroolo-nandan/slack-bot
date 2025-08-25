// Response Formatter - Converts JSON API responses to Slack Block Kit format

class ResponseFormatter {
  // Helpers
  isValidHttpUrl(u) {
    try {
      const url = new URL(u);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) { return false; }
  }

  safeActionValue(obj, max = 1900) {
    try {
      const s = JSON.stringify(obj);
      if (s.length <= max) return s;
      return JSON.stringify({ _truncated: true, data: String(s).slice(0, max) });
    } catch (_) {
      return String(obj);
    }
  }

  truncate(text, max = 500) {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max - 3) + '...';
  }

  // Normalize noisy previews coming from connectors (e.g., remove boilerplate and failure notes)
  cleanContentPreview(text = '') {
    try {
      let t = String(text);
      // Remove common boilerplate labels
      t = t.replace(/^(GitHub Repository:|Google Doc:|PDF Document:|File:|Document:|Folder:)\s*/i, '');
      // Remove parenthetical failure notes
      t = t.replace(/\((content extraction failed|unable to parse|no preview available)\)/gi, '').trim();
      // Collapse excessive newlines/whitespace
      t = t.replace(/\n{3,}/g, '\n\n').replace(/\s{2,}/g, ' ');
      return t.trim();
    } catch (_) {
      return text;
    }
  }

  platformEmoji(platform = '') {
    const p = String(platform || '').toLowerCase();
    if (p.includes('github')) return '🐙 GitHub';
    if (p.includes('google_drive') || p.includes('google')) return '🟨 Google Drive';
    if (p.includes('slack')) return '💬 Slack';
    return '🔗 ' + (platform || 'Unknown');
  }

  formatConversationalResponse(data) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🤖 ${data.message}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `💡 Powered by AI Assistant • Confidence: ${Math.round((data.confidence || 1) * 100)}%`
        }
      ]
    }
  ];
}




  formatResponse(data, apiUsed) {
    try {

         if (data && data.type === 'conversational') {
      return this.formatConversationalResponse(data);
    }
      // Handle Enterprise Search API responses
      if (data && typeof data === 'object') {
        // Handle different Enterprise Search API response structures
        switch (apiUsed) {
          case 'search':
            return this.formatSearchResults(data);
          case 'recent-searches':
            return this.formatRecentSearches(data);
          case 'suggested-documents':
            return this.formatSuggestedDocuments(data);
          case 'trending-documents':
            return this.formatTrendingDocuments(data);
          case 'dynamic-suggestions':
            return this.formatDynamicSuggestions(data);
          default:
            return this.formatGenericResponse(data, apiUsed);
        }
      } else {
        return this.formatSimpleResponse(data, apiUsed);
      }
    } catch (error) {
      console.error('Error formatting response:', error);
      return this.formatErrorResponse('Failed to format response');
    }
  }

  formatSearchResults(data) {
    const blocks = [];

    // Handle multiple API response shapes
    const shapeBResults = Array.isArray(data.result) ? data.result : null; // { summary, result: [...] }
    const results = shapeBResults || data.results || [];
    const total = typeof data.total === 'number' ? data.total : (results.length || 0);
    const searchTime = typeof data.response_time === 'number' ? Math.round(data.response_time * 1000) : undefined;

    // Header with search stats
    const queryText = data.user_query || data.query;
    const q = queryText ? ` for "${queryText}"` : '';
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `🔍 Search Results (${total} found)${q}`
      }
    });

    // Add search performance info
    if (searchTime || data.search_method || data.performance) {
      const perfBits = [];
      if (searchTime) perfBits.push(`⚡ ${searchTime}ms`);
      if (data.search_method) perfBits.push(`🧠 ${data.search_method}`);
      const rps = data.performance?.results_per_second;
      if (typeof rps === 'number') perfBits.push(`📈 ${rps} results/s`);
      if (perfBits.length) {
        blocks.push({ type: 'context', elements: [ { type: 'mrkdwn', text: perfBits.join(' • ') } ] });
      }
    }

    // If new shape includes a top-level summary, render it
    if (typeof data.summary === 'string' && data.summary.trim()) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: this.truncate(data.summary, 1500) } });
    }

    if (results && results.length > 0) {
      // Show first 5 results to avoid overwhelming
      const resultsToShow = results;

      resultsToShow.forEach((result, index) => {
        blocks.push({ type: "divider" });

        // New shape: { title, description, url, source }
        if (shapeBResults) {
          const sectionBlock = {
            type: 'section',
            text: { type: 'mrkdwn', text: `*${result.title || 'Untitled'}*\n${this.truncate(result.description || 'No description available')}` }
          };
          if (result.url && this.isValidHttpUrl(result.url)) {
            sectionBlock.accessory = { type: 'button', text: { type: 'plain_text', text: 'Open' }, url: result.url };
          }
          blocks.push(sectionBlock);
          const src = result.source ? `📦 ${result.source}` : null;
          if (src) {
            blocks.push({ type: 'context', elements: [ { type: 'mrkdwn', text: src } ] });
          }
        } else {
          // Legacy/other shape with content_preview & metadata
          const contentPreview = this.truncate(result.content_preview ? this.cleanContentPreview(result.content_preview) : 'No preview available');
          const sectionBlock = {
            type: "section",
            text: { type: "mrkdwn", text: `*${result.title || result.file_name || 'Untitled'}*\n${contentPreview}` }
          };
          if (result.url && this.isValidHttpUrl(result.url)) {
            sectionBlock.accessory = { type: "button", text: { type: "plain_text", text: "Open" }, url: result.url };
          }
          blocks.push(sectionBlock);
          const platform = result.platform || result.connector_type || 'unknown';
          const score = typeof result.score === 'number' ? result.score : 0;
          const docType = result.document_type || result.file_type || 'Document';
          const visibility = result.metadata?.visibility ? ` • 👁️ ${result.metadata.visibility}` : '';
          const relevance = result.search_context?.query_relevance ? ` • 🎯 ${String(result.search_context.query_relevance).toUpperCase()} relevance` : '';
          const ghStars = typeof result.metadata?.stars_count === 'number' ? ` • ⭐ ${result.metadata.stars_count}` : '';
          const ghForks = typeof result.metadata?.forks_count === 'number' ? ` • 🍴 ${result.metadata.forks_count}` : '';
          const lastMod = result.metadata?.last_modified ? ` • 🕒 ${new Date(result.metadata.last_modified).toLocaleString()}` : '';
          blocks.push({ type: 'context', elements: [ { type: 'mrkdwn', text: `${this.platformEmoji(platform)} • 📁 ${docType}${visibility}${relevance}${ghStars}${ghForks}${lastMod} • 📊 Score: ${score}` } ] });
        }
      });

      // Show "and X more" + action if there are more results
      // const shownCount = resultsToShow.length;
      // const remaining = Math.max(0, results.length - shownCount);
      // if (remaining > 0) {
      //   blocks.push({
      //     type: "context",
      //     elements: [ { type: "mrkdwn", text: `_... and ${remaining} more results_` } ]
      //   });
      //   // Add Show more button to fetch more from backend (increase limit)
      //   // Prepare compact payload containing remaining results to avoid another backend call
      //   // Slack 'value' max ~2000 chars; keep very compact
      //   const compactRemaining = results.slice(shownCount).map(r => ({
      //     title: this.truncate(r.title || r.file_name || 'Untitled', 110),
      //     description: this.truncate(
      //       shapeBResults ? (r.description || '') : (r.content_preview ? this.cleanContentPreview(r.content_preview) : ''),
      //       180
      //     ),
      //     url: r.url && this.isValidHttpUrl(r.url) ? r.url : undefined,
      //     source: (r.source || r.platform || r.connector_type || '').slice(0, 40) || undefined
      //   }));
      //   blocks.push({
      //     type: 'actions',
      //     elements: [
      //       {
      //         type: 'button',
      //         text: { type: 'plain_text', text: `Show remaining (${remaining})` },
      //         action_id: 'search_show_more',
      //         value: this.safeActionValue({ user_query: queryText, remainingResults: compactRemaining })
      //       }
      //     ]
      //   });
      // }

    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "No results found for your search query."
        }
      });
    }

    return blocks;
  }

  formatRecentSearches(data) {
    const blocks = [];

    // Support multiple payload shapes
    const searches = data.recent_searches || data.data || [];
    const total = typeof data.total_count === 'number' ? data.total_count : (data.total || searches.length || 0);

    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📚 Recent Searches (${total})`
      }
    });

    if (searches && searches.length > 0) {
      searches.forEach((search) => {
        blocks.push({ type: "divider" });

        const query = search.query || search.search || '';
        const resultsCount = typeof search.results_count === 'number' ? search.results_count : undefined;
        const when = search.timeAgo || (search.timestamp ? new Date(search.timestamp).toLocaleString() : (search.searched_at ? new Date(search.searched_at).toLocaleString() : ''));
        const durationMs = typeof search.search_duration_ms === 'number' ? search.search_duration_ms : undefined;
        const ok = typeof search.search_successful === 'boolean' ? search.search_successful : undefined;

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${query ? '"' + query + '"' : 'Search'}*${resultsCount != null ? `\n${resultsCount} results` : ''}`
          }
        });

        const ctxBits = [];
        if (when) ctxBits.push(`🕒 ${when}`);
        if (durationMs != null) ctxBits.push(`⚡ ${durationMs} ms`);
        if (ok != null) ctxBits.push(ok ? '✅ Successful' : '⚠️ Failed');
        if (ctxBits.length) {
          blocks.push({ type: "context", elements: [ { type: "mrkdwn", text: ctxBits.join(' • ') } ] });
        }
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "No recent searches found."
        }
      });
    }

    return blocks;
  }

  formatSuggestedDocuments(data) {
    const blocks = [];

    // Handle real API response structure - data.suggested_documents contains the documents
    const documents = data.suggested_documents || [];
    const total = typeof data.total_suggestions === 'number' ? data.total_suggestions : (documents.length || 0);
    const reason = data.suggestion_reason;

    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `💡 Suggested Documents (${total})`
      }
    });

    if (documents && documents.length > 0) {
      if (reason) {
        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: `🧠 ${reason}` }
          ]
        });
      }

      documents.forEach((doc) => {
        blocks.push({ type: "divider" });

        const sectionBlock = {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${doc.title || 'Untitled'}*\n${this.truncate(this.cleanContentPreview(doc.content_preview || ''))}`
          }
        };

        if (doc.url && this.isValidHttpUrl(doc.url)) {
          sectionBlock.accessory = {
            type: "button",
            text: { type: "plain_text", text: "Open" },
            url: doc.url
          };
        }

        blocks.push(sectionBlock);

        const platform = doc.platform || doc.integration_type || doc.connector_type || 'unknown';
        const score = typeof doc.relevance_score === 'number' ? doc.relevance_score : 0;
        const why = doc.suggestion_reason || doc.reason;

        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🔗 ${platform} • 📁 ${doc.file_type || 'unknown'} • 📊 Score: ${score}${why ? ` • 💡 ${why}` : ''}`
            }
          ]
        });
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "No document suggestions available."
        }
      });
    }

    return blocks;
  }

  formatTrendingDocuments(data) {
    const blocks = [];

    // Support multiple possible payload shapes
    const documents = data.documents || data.trending_documents || data.suggested_documents || data.data || [];
    const total = typeof data.total === 'number' ? data.total
                 : typeof data.total_trending === 'number' ? data.total_trending
                 : typeof data.total_suggestions === 'number' ? data.total_suggestions
                 : documents.length || 0;

    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `🔥 Trending Documents (${total})` }
    });

    // Optional performance/method context
    if (data.response_time || data.search_method || data.performance) {
      const perfBits = [];
      if (typeof data.response_time === 'number') perfBits.push(`⚡ ${Math.round(data.response_time * 1000)}ms`);
      if (data.search_method) perfBits.push(`🧠 ${data.search_method}`);
      const rps = data.performance?.results_per_second;
      if (typeof rps === 'number') perfBits.push(`📈 ${rps} results/s`);
      if (perfBits.length) blocks.push({ type: 'context', elements: [ { type: 'mrkdwn', text: perfBits.join(' • ') } ] });
    }

    if (documents && documents.length > 0) {
      const maxItems = 5;
      const offset = Number(data?._offset || 0);
      const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
      const toShow = documents.slice(start, start + maxItems);
      toShow.forEach((doc) => {
        blocks.push({ type: "divider" });

        const rawPreview = this.cleanContentPreview(doc.content_preview || doc.content || '');
        const preview = rawPreview ? this.truncate(rawPreview) : '';

        const sectionBlock = {
          type: "section",
          text: { type: "mrkdwn", text: preview ? `*${doc.title || 'Untitled'}*\n${preview}` : `*${doc.title || 'Untitled'}*` },
        };

        if (doc.url && this.isValidHttpUrl(doc.url)) {
          sectionBlock.accessory = {
            type: "button",
            text: { type: "plain_text", text: "Open" },
            url: doc.url
          };
        }

        blocks.push(sectionBlock);

        const platform = doc.platform || doc.integration_type || doc.connector_type || 'unknown';
        const fileType = doc.file_type || doc.document_type || 'unknown';
        const why = doc.suggestion_reason || doc.reason || doc.trending_query;
        const hits = typeof doc.search_hit_count === 'number' ? doc.search_hit_count : null;
        const trendScore = typeof doc.trend_score === 'number' ? doc.trend_score : null;
        const relevanceScore = typeof doc.relevance_score === 'number' ? doc.relevance_score : null;
        const metric = hits != null ? `🔎 Hits: ${hits}` : (trendScore != null ? `📊 Trend: ${trendScore}` : (relevanceScore != null ? `📊 Score: ${relevanceScore}` : ''));
        const actionMetaScore = hits ?? trendScore ?? relevanceScore ?? 0;

        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: `${this.platformEmoji(platform)} • 📁 ${fileType}${why ? ` • 💡 ${why}` : ''}${metric ? ` • ${metric}` : ''}` }
          ]
        });
      });

      // Pagination controls for trending
      const shownCount = toShow.length + start;
      const remaining = Math.max(0, total - shownCount);
      if (remaining > 0) {
        blocks.push({ type: 'context', elements: [ { type: 'mrkdwn', text: `_... and ${remaining} more_` } ] });
        blocks.push({
          type: 'actions',
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: `Show more (${remaining})` },
              action_id: "trending_show_more",
              value: this.safeActionValue({ offset: start + toShow.length, total, shown: start + toShow.length })
            }
          ]
        });
      }
    } else {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: "No trending documents found." } });
    }

    return blocks;
  }

  formatDynamicSuggestions(data) {
    const blocks = [];

    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `💭 Search Suggestions for "${data.partial_query}"`
      }
    });

    if (data.suggestions && data.suggestions.length > 0) {
      const suggestionText = data.suggestions.map((suggestion, index) =>
        `${index + 1}. ${suggestion}`
      ).join('\n');

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: suggestionText
        }
      });

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `💡 ${data.total_suggestions} suggestions found`
          }
        ]
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "No suggestions available for this query."
        }
      });
    }

    return blocks;
  }

  formatGenericResponse(data, apiUsed) {
    return this.formatObjectResponse(data, apiUsed);
  }

  formatArrayResponse(data, apiUsed) {
    const blocks = [];
    
    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 ${this.getApiDisplayName(apiUsed)} Results (${data.length} items)`
      }
    });

    // If too many items, show only first few
    const itemsToShow = Math.min(data.length, 5);
    const hasMore = data.length > itemsToShow;

    for (let i = 0; i < itemsToShow; i++) {
      const item = data[i];
      blocks.push({
        type: "divider"
      });
      
      blocks.push(...this.formatSingleItem(item, i + 1));
    }

    // Show "and X more" if there are more items
    if (hasMore) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_... and ${data.length - itemsToShow} more items_`
          }
        ]
      });
    }

    return blocks;
  }

  formatObjectResponse(data, apiUsed) {
    const blocks = [];
    
    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 ${this.getApiDisplayName(apiUsed)} Details`
      }
    });

    blocks.push({
      type: "divider"
    });

    // Format object fields
    blocks.push(...this.formatSingleItem(data));

    return blocks;
  }

  formatSingleItem(item, index = null) {
    const blocks = [];
    
    // Create fields for the item
    const fields = [];
    const importantFields = this.getImportantFields(item);
    
    // Add important fields first
    for (const [key, value] of Object.entries(importantFields)) {
      fields.push({
        type: "mrkdwn",
        text: `*${this.formatFieldName(key)}:*\n${this.formatFieldValue(value)}`
      });
    }

    // Add other fields (limit to avoid overwhelming)
    const otherFields = Object.entries(item)
      .filter(([key]) => !importantFields.hasOwnProperty(key))
      .slice(0, 6); // Limit to 6 additional fields

    for (const [key, value] of otherFields) {
      if (this.shouldIncludeField(key, value)) {
        fields.push({
          type: "mrkdwn",
          text: `*${this.formatFieldName(key)}:*\n${this.formatFieldValue(value)}`
        });
      }
    }

    // Create section block
    const sectionBlock = {
      type: "section",
      fields: fields.slice(0, 10) // Slack limits to 10 fields per section
    };

    // Add index if provided
    if (index !== null) {
      sectionBlock.text = {
        type: "mrkdwn",
        text: `*Item ${index}*`
      };
    }

    blocks.push(sectionBlock);

    return blocks;
  }

  formatSimpleResponse(data, apiUsed) {
  // Handle conversational messages that don't have complex data structure
  if (data && typeof data === 'object' && data.message) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🤖 ${data.message}`
        }
      }
    ];
  }

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `✅ ${this.getApiDisplayName(apiUsed)} Response`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`${JSON.stringify(data, null, 2)}\`\`\``
      }
    }
  ];
}


  formatErrorResponse(error) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Error:* ${error}`
        }
      }
    ];
  }

 getApiDisplayName(apiUsed) {
  // ADD NULL/UNDEFINED CHECK
  if (!apiUsed || apiUsed === '_none' || apiUsed === 'conversational') {
    return 'AI Assistant';
  }

  const displayNames = {
    search: 'Search Results',
    'recent-searches': 'Recent Searches',
    'suggested-documents': 'Suggested Documents',
    'trending-documents': 'Trending Documents',
    'dynamic-suggestions': 'Search Suggestions'
  };

  return displayNames[apiUsed] || apiUsed.charAt(0).toUpperCase() + apiUsed.slice(1);
}

   

  getIntegrationIcon(integrationType) {
    const icons = {
      'google_drive': '📄',
      'slack': '💬',
      'dropbox': '📦',
      'jira': '🎫',
      'zendesk': '🎮',
      'document360': '📚'
    };

    return icons[integrationType] || '📁';
  }

  cleanContentPreview(content) {
    if (!content) return 'No preview available';

    // Remove special characters, control characters, and excessive whitespace
    let cleaned = content
      .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[=]{3,}/g, '') // Remove separator lines like ===
      .replace(/[-]{3,}/g, '') // Remove separator lines like ---
      .trim();

    // Truncate to reasonable length
    if (cleaned.length > 150) {
      cleaned = cleaned.substring(0, 150) + '...';
    }

    return cleaned || 'Content preview not available';
  }

  getImportantFields(item) {
    const important = {};
    
    // Common important field patterns
    const importantPatterns = [
      'id', 'name', 'title', 'email', 'status', 'state',
      'userId', 'orderId', 'productId', 'customerId',
      'amount', 'price', 'total', 'quantity',
      'createdAt', 'updatedAt', 'date', 'timestamp'
    ];

    for (const pattern of importantPatterns) {
      // Exact match
      if (item.hasOwnProperty(pattern)) {
        important[pattern] = item[pattern];
      }
      
      // Case-insensitive match
      const key = Object.keys(item).find(k => 
        k.toLowerCase() === pattern.toLowerCase()
      );
      if (key && !important.hasOwnProperty(key)) {
        important[key] = item[key];
      }
    }

    return important;
  }

  formatFieldName(key) {
    // Convert camelCase/snake_case to readable format
    return key
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
      .trim();
  }

  formatFieldValue(value) {
    if (value === null || value === undefined) {
      return '_Not set_';
    }
    
    if (typeof value === 'boolean') {
      return value ? '✅ Yes' : '❌ No';
    }
    
    if (typeof value === 'object') {
      // For nested objects, show a summary or JSON
      if (Array.isArray(value)) {
        return `Array (${value.length} items)`;
      } else {
        return `\`${JSON.stringify(value, null, 2)}\``;
      }
    }
    
    // Format dates
    if (this.isDateString(value)) {
      try {
        const date = new Date(value);
        return date.toLocaleString();
      } catch (e) {
        return value;
      }
    }
    
    // Format numbers with commas for large values
    if (typeof value === 'number' && value > 999) {
      return value.toLocaleString();
    }
    
    return String(value);
  }

  shouldIncludeField(key, value) {
    // Skip fields that are not useful to display
    const skipPatterns = [
      /^_/, // Private fields starting with underscore
      /password/i,
      /secret/i,
      /token/i,
      /key$/i,
      /hash$/i
    ];
    
    for (const pattern of skipPatterns) {
      if (pattern.test(key)) {
        return false;
      }
    }
    
    // Skip null/undefined values
    if (value === null || value === undefined) {
      return false;
    }
    
    // Skip very long strings (probably not useful for display)
    if (typeof value === 'string' && value.length > 200) {
      return false;
    }
    
    return true;
  }

  isDateString(value) {
    if (typeof value !== 'string') return false;
    
    // Common date patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/, // ISO date
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO datetime
      /\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
      /\d{2}-\d{2}-\d{4}/ // MM-DD-YYYY
    ];
    
    return datePatterns.some(pattern => pattern.test(value));
  }
}

module.exports = {
  formatResponse: (data, apiUsed) => new ResponseFormatter().formatResponse(data, apiUsed)
};
