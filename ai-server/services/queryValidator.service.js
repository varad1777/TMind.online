// LLM-first extraction with chain-of-thought + tool calling (function calling)
// Best practices for structured extraction and external tool invocation

import { sqlConfig } from '../utils/utils.js';
import groqService from './groq.service.js';
import dayjs from 'dayjs';
import sql from 'mssql';

// import sql from 'mssql/msnodesqlv8.js';


const GROQ_MODEL = 'llama-3.1-8b-instant';

/**
 * BEST PRACTICE #1: Define Tool Schemas
 * - Groq supports function_calling with explicit tool definitions
 * - Tool schemas guide the LLM to call functions with correct parameters
 */
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'lookup_asset',
      description: 'Lookup a canonical asset in the database by name or partial match. Returns AssetId and official Name.',
      parameters: {
        type: 'object',
        properties: {
          candidateName: {
            type: 'string',
            description: 'The asset name or identifier to look up (e.g., "engine 2")',
          },
        },
        required: ['candidateName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'normalize_time_window',
      description: 'Convert a relative or absolute time expression into ISO 8601 from/to timestamps. Handles "24h", "5 minutes", "Jan 15 2025", date ranges, etc.',
      parameters: {
        type: 'object',
        properties: {
          timeExpression: {
            type: 'string',
            description: 'Time window in natural language (e.g., "last 24 hours", "from Jan 10 to Jan 15")',
          },
        },
        required: ['timeExpression'],
      },
    },
  },
];

/**
 * BEST PRACTICE #2: Chain-of-Thought Prompt Structure
 * - Uses explicit reasoning steps to improve accuracy
 * - Separates internal reasoning from final JSON output
 * - Includes few-shot examples with reasoning traces
 */
function buildAdvancedCoTPrompt(userQuery) {
  return `
You are an expert RCA (Root Cause Analysis) query parser specializing in extracting assets and time windows.

=== YOUR TASK ===
Extract TWO pieces of information from the user's natural language query:
1. ASSET: Name/identifier of the equipment (e.g., "engine 2", "line A") → or null
2. TIME: A natural language time expression → or null

=== CHAIN-OF-THOUGHT REASONING ===
Follow these steps internally (do NOT show this in your final output):

Step 1: IDENTIFY KEY TOKENS
  - Scan the query for asset identifiers (nouns, numbered items, proper names)
  - Scan for time expressions (numbers + units, date formats, relative references)

Step 2: DISAMBIGUATE AMBIGUITY
  - If "24h" appears, it means "last 24 hours" (relative)
  - If "Jan 15" appears, treat as specific date
  - If "from X to Y" appears, treat as a range
  - Ignore stop words: "what", "is", "the", "a", "status", "of"

Step 3: VALIDATE CONFIDENCE
  - Confirm asset token makes sense (not a verb, adjective, or filler word)
  - Confirm time token is unambiguous
  - If uncertain, mark as null

Step 4: STRUCTURE OUTPUT
  - Return ONLY valid JSON
  - Do NOT include reasoning, markdown, or explanatory text
  - Use exact field names: "asset", "time"

=== FEW-SHOT EXAMPLES WITH REASONING ===

Example 1:
Input: "what is status of engine 2 from last 24 hours"
Reasoning: 
  - Token "engine 2" = asset (noun phrase + number)
  - Token "last 24 hours" = time (explicit relative reference)
  - Confidence: HIGH
Output: {"asset":"engine 2","time":"last 24 hours"}

Example 2:
Input: "show me engine asset logs for 5 minutes"
Reasoning:
  - Token "engine asset" = asset (proper noun, system name)
  - Token "5 minutes" = time (number + unit)
  - Confidence: HIGH
Output: {"asset":"engine asset","time":"5 minutes"}

Example 3:
Input: "what happened yesterday"
Reasoning:
  - No asset identifier found
  - Token "yesterday" = time (relative date reference)
  - Confidence: HIGH for time, LOW for asset
Output: {"asset":null,"time":"yesterday"}

Example 4:
Input: "analyze line A from Jan 15 2025 to Jan 20 2025"
Reasoning:
  - Token "line A" = asset (equipment label)
  - Token "from Jan 15 2025 to Jan 20 2025" = time (date range)
  - Confidence: HIGH
Output: {"asset":"line A","time":"from Jan 15 2025 to Jan 20 2025"}

=== CRITICAL RULES ===
1. Output MUST be valid JSON only (no markdown, no extra text)
2. Asset/time values are plain strings (not objects at this stage)
3. Return null if element is genuinely missing
4. Do NOT make up information
5. Do NOT include internal reasoning in the output

=== NOW ANALYZE THIS QUERY ===

User query: "${userQuery}"

Output JSON only (exactly one JSON object, no additional text):
`;
}

/**
 * BEST PRACTICE #3: Tool Calling Handler
 * - Implements the "tool calling loop" pattern
 * - LLM requests tool calls, we execute them, feed results back
 */
async function executeTool(toolName, toolArgs) {
  switch (toolName) {
    case 'lookup_asset': {
      const records = await executeSqlLookupAsset(toolArgs.candidateName);
      if (!records || records.length === 0) {
        return {
          success: false,
          error: `Asset "${toolArgs.candidateName}" not found in database`,
        };
      }
      return {
        success: true,
        data: {
          assetId: records[0].AssetId,
          canonicalName: records[0].Name,
        },
      };
    }

    case 'normalize_time_window': {
      const window = normalizeToWindow(toolArgs.timeExpression);
      return {
        success: true,
        data: {
          from: window.from,
          to: window.to,
          rawExpression: toolArgs.timeExpression,
        },
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * BEST PRACTICE #4: Multi-Turn Tool Calling Loop
 * - Handles LLM responses that request tool calls
 * - Feeds tool results back to LLM for final answer
 * - Prevents infinite loops with max iterations
 */
async function callGroqWithToolSupport(userQuery, maxIterations = 3) {
  const systemPrompt = buildAdvancedCoTPrompt(userQuery);
  
  let iteration = 0;
  const messages = [
    { role: 'user', content: userQuery }
  ];

  while (iteration < maxIterations) {
    iteration++;

    // Call LLM with tool definitions
    const llmResp = await groqService.chatWithGroq(userQuery, systemPrompt, {
      model: GROQ_MODEL,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto', // LLM decides whether to use tools
    });

    console.log(llmResp?.choices?.[0]?.message?.content);

    const content = llmResp?.choices?.[0]?.message?.content || '';
    const toolCalls = llmResp?.choices?.[0]?.message?.tool_calls || [];


    // If no tool calls, LLM gave us final answer (JSON)
    if (toolCalls.length === 0) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (err) {
          throw new Error(`Failed to parse final JSON: ${err.message}`);
        }
      }
      throw new Error('LLM returned no tool calls and no valid JSON');
    }

    // Execute each tool call and collect results
    const toolResults = [];
    for (const toolCall of toolCalls) {
      
      let toolResult;
      try {
        const args = typeof toolCall.function.arguments === 'string' 
          ? JSON.parse(toolCall.function.arguments) 
          : toolCall.function.arguments;
        
        toolResult = await executeTool(toolCall.function.name, args);
      } catch (err) {
        toolResult = { success: false, error: err.message };
      }

      toolResults.push({
        tool_call_id: toolCall.id,
        tool_name: toolCall.function.name,
        result: toolResult,
      });

    }

    // Add tool results to message history for next iteration
    messages.push({ role: 'assistant', content, tool_calls: toolCalls });
    messages.push({
      role: 'user',
      content: toolResults.map(tr => 
        `Tool "${tr.tool_name}" (ID: ${tr.tool_call_id}) returned: ${JSON.stringify(tr.result)}`
      ).join('\n'),
    });
  }

  throw new Error(`Max tool iterations (${maxIterations}) reached without final answer`);
}

/**
 * BEST PRACTICE #5: SQL Lookup Implementation
 */
const SQL_LOOKUP_ASSET = `
  SELECT TOP (1) AssetId, Name
  FROM Assets
  WHERE LOWER(REPLACE(Name, ' ', '')) = LOWER(REPLACE(@candidate, ' ', ''))
     OR LOWER(Name) LIKE '%' + LOWER(@candidate) + '%'
`;

// const sqlConfig = {
//     driver: 'msnodesqlv8',
//     connectionString: `Server=asset-sql,1433;Database=TmindDB2Asset;User Id=sa;Password=${process.env.SQL_SERVER_PASSWORD};TrustServerCertificate=True;`
// };





async function executeSqlLookupAsset(candidateName) {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const req = pool.request();
    req.input('candidate', sql.NVarChar(256), candidateName);
    const res = await req.query(`
      SELECT TOP (1) AssetId, Name
      FROM Assets
      WHERE LOWER(REPLACE(Name, ' ', '')) = LOWER(REPLACE(@candidate, ' ', ''))
         OR LOWER(Name) LIKE '%' + LOWER(@candidate) + '%'
    `);


    return res.recordset || [];
  } finally {
    if (pool && pool.close) {
      try { await pool.close(); } catch (e) { /* ignore close errors */ }
    }
  }
}

/**
 * BEST PRACTICE #6: Time Window Normalization
 * - Handles multiple time formats
 * - Provides ISO 8601 output for consistency
 */
function normalizeToWindow(timeExpression) {
  if (!timeExpression) {
    return {
      from: dayjs().subtract(24, 'hour').toISOString(),
      to: dayjs().toISOString(),
    };
  }

  try {
    const expr = String(timeExpression).toLowerCase();
    
    // Relative patterns: "24 hours", "5 minutes", "2 days"
    const relativeMatch = expr.match(/(\d+)\s*(second|minute|hour|day|week)s?/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const from = dayjs().subtract(amount, unit);
      return {
        from: from.toISOString(),
        to: dayjs().toISOString(),
      };
    }

    // Relative keywords: "yesterday", "today", "last week"
    if (expr.includes('yesterday')) {
      return {
        from: dayjs().subtract(1, 'day').startOf('day').toISOString(),
        to: dayjs().subtract(1, 'day').endOf('day').toISOString(),
      };
    }
    if (expr.includes('today')) {
      return {
        from: dayjs().startOf('day').toISOString(),
        to: dayjs().endOf('day').toISOString(),
      };
    }

    // Date range: "from Jan 15 2025 to Jan 20 2025"
    const rangeMatch = expr.match(/from\s+(.+?)\s+to\s+(.+?)$/i);
    if (rangeMatch) {
      const from = dayjs(rangeMatch[1]);
      const to = dayjs(rangeMatch[2]);
      if (from.isValid() && to.isValid()) {
        return { from: from.toISOString(), to: to.toISOString() };
      }
    }

    // Fallback: try parsing directly
    const parsed = dayjs(timeExpression);
    if (parsed.isValid()) {
      return {
        from: parsed.startOf('day').toISOString(),
        to: parsed.endOf('day').toISOString(),
      };
    }

    // Default: last 24 hours
    return {
      from: dayjs().subtract(24, 'hour').toISOString(),
      to: dayjs().toISOString(),
    };
  } catch (err) {
    console.warn(`Failed to normalize time: ${err.message}`);
    return {
      from: dayjs().subtract(24, 'hour').toISOString(),
      to: dayjs().toISOString(),
    };
  }
}

/**
 * BEST PRACTICE #7: Main Validation Function
 * - Orchestrates extraction, tool calling, and resolution
 * - Returns structured result with full metadata
 */
export async function validateAndResolveLLMFirst(userQuery = 'what is status of varad assets') {
  if (!userQuery || typeof userQuery !== 'string') {
    return {
      valid: false,
      reason: 'empty_query',
      message: 'Please enter the asset name.',
    };
  }


  // Step 1: Extract asset & time with tool support
  let extracted;
  try {
    extracted = await callGroqWithToolSupport(userQuery, 3);
  } catch (err) {
    console.error(`[Extraction] Error:`, err.message);
    return {
      valid: false,
      reason: 'llm_error',
      message: 'Failed to parse query. Please be more specific about the asset name.',
      debug: err.message,
    };
  }

  // Step 2: Validate asset exists
  if (!extracted.asset) {
    return {
      valid: false,
      reason: 'missing_asset',
      message: 'Please specify an asset name (e.g., "engine 2", "engine asset").',
    };
  }

  // Step 3: Normalize time window
  const timeExpression = extracted.time || '24 hours';
  const parsedWindow = normalizeToWindow(timeExpression);

  // Step 4: Resolve canonical asset via SQL
  const lookupKey = String(extracted.asset).replace(/[^\w\-]/g, '').trim();
  let records = [];
  try {
    records = await executeSqlLookupAsset(lookupKey);
  } catch (err) {
    console.error(`[SQL] Error:`, err.message);
    return {
      valid: false,
      reason: 'sql_error',
      message: 'Database error while resolving asset.',
      error: err.message,
    };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return {
      valid: false,
      reason: 'asset_not_found',
      message: `Asset "${extracted.asset}" not found in database.`,
    };
  }

  const canonical = records[0];
  return {
    valid: true,
    reason: 'ok',
    message: `Requesting status of ${canonical.Name} from ${extracted.time || '24 hours'}`,
    asset: {
      assetId: canonical.AssetId,
      name: canonical.Name,
      originalInput: extracted.asset,
    },
    timeWindow: {
      raw: extracted.time || '24 hours',
      parsed: parsedWindow,
    },
  };
}

// Test
