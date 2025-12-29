// langgraph-handler.js
import 'dotenv/config';
import { StateGraph, START, END } from "@langchain/langgraph";
import { MessagesZodMeta } from "@langchain/langgraph";
import { registry } from "@langchain/langgraph/zod";
import * as z from "zod";

// const sql = require('mssql/msnodesqlv8'); // Windows auth driver
import { InfluxDB } from '@influxdata/influxdb-client';
// import sql from 'mssql/msnodesqlv8.js';
import groqService from './groq.service.js';
import { extractSignalValues, sqlConfig } from "../utils/utils.js"; // your existing function
import sql from 'mssql';




// const sqlConfig = {
//     driver: 'msnodesqlv8',
//     connectionString: `Server=asset-sql,1433;Database=TmindDB2Asset;User Id=sa;Password=${process.env.SQL_SERVER_PASSWORD};TrustServerCertificate=True;`
// };

// --- InfluxDB config ---
const influx = new InfluxDB({ url: process.env.INFLUX_URL, token: process.env.INFLUX_TOKEN });
const queryApi = influx.getQueryApi(process.env.INFLUX_ORG);


// ---------- State schema ----------
const QueryState = z.object({
  userQuery: z.string().optional(),
  generated: z
    .object({
      sql: z.string().optional(),
      flux: z.string().optional(),
    })
    .optional(),
  sqlRows: z.array(z.record(z.string(), z.any())).optional(),
  fluxRaw: z.array(z.any()).optional(),
  cleaned: z.array(z.any()).optional(),
  error: z.string().optional(),
  // you can add more fields for tracing, timestamps, metadata etc.
});

// Register messages meta only if you use LLM message shapes; not required here
// (keeps schema flexible for plain-state)
const GraphState = QueryState;

// ---------- Node: generate SQL + Flux via your groq LLM ----------
async function llmGenerate(state) {
  console.log("Inside llmGenerate function");
  const userQuery = state.userQuery || "";
  // Reuse the exact system prompt you already use, or load from file/env
  const systemPrompt = `
  
  You are an Industrial RCA Query Generator. 
// Your job is to convert a user's natural-language query into:

// 1) A SQL query that fetches:
//    - AssetId
//    - SignalTypeId
//    - DeviceId (if needed)
//    - DevicePortId (if needed)

// 2) A Flux query template used to query time-series data from InfluxDB.

// ------------------------------------
// IMPORTANT RULES
// ------------------------------------
// ✔ ALWAYS return ONLY valid JSON with keys: "sql" and "flux".
// ✔ NEVER explain your reasoning.
// ✔ NEVER add any text outside JSON.
// ✔ NEVER add code fences (no).
// ✔ NEVER add comments.
// ✔ Ensure JSON is always clean & parseable.

// ------------------------------------
// SQL RULES
// ------------------------------------
// Use SQL Server syntax.

// Tables available:

//   Assets(
//     AssetId UNIQUEIDENTIFIER,
//     Name NVARCHAR,
//     Level INT,
//     ParentId UNIQUEIDENTIFIER
//   )

//   MappingTable(
//     MappingId UNIQUEIDENTIFIER,
//     AssetId UNIQUEIDENTIFIER,
//     SignalTypeId UNIQUEIDENTIFIER,
//     DeviceId UNIQUEIDENTIFIER,
//     DevicePortId UNIQUEIDENTIFIER
//   )

// Normalization rules:
// - Convert asset name to lowercase
// - Remove spaces
//   Example: "Engine 2", "engine2", "ENGINE 2" → "engine2"
// - Match using:
//   REPLACE(LOWER(a.Name), ' ', '')

// SQL OUTPUT RULES:
// - MUST return AssetId and SignalTypeId.
// - AssetId and SignalTypeId must be in lowercase.
// - If multiple matching assets exist, return all.
// - The SQL output MUST NOT include any placeholders.

// ------------------------------------
// FLUX RULES
// ------------------------------------
// Bucket name is EXACTLY:
//   SignalValueTeleMentry

// MUST use time range extracted from user query.
// Examples:
//   "today" -> -24h
//   "last 7 days" -> -7d
//   "last 3 hours" -> -3h
//   If no range: default to -24h.

// Flux MUST include placeholders (DO NOT fill IDs):

//   ASSET_IDS
//   SIGNAL_TYPE_IDS
//   TIME_RANGE

// Final Flux template MUST look like:

// from(bucket: "SignalValueTeleMentry")
//   |> range(start: TIME_RANGE)
//   |> filter(fn: (r) => contains(value: r.assetId, set: ASSET_IDS))
//   |> filter(fn: (r) => contains(value: r.signalTypeId, set: SIGNAL_TYPE_IDS))
  

// RULES:
// ✔ Do NOT wrap ASSET_IDS with brackets.
// ✔ ASSET_IDS strictly in lower case (A68E72EC-FCCA-4805-3D65-08DE316F4FED this is wrong , a68e72ec-fcca-4805-3d65-08de316f4fed, this is correct ).
// ✔ Do NOT wrap SIGNAL_TYPE_IDS with brackets.
// ✔ SIGNAL_TYPE_IDS strictly in lower case (5FD4B207-C09D-49FC-9485-20D95ADECA78 this is wrong , 5fd4b207-c09d-49fc-9485-20d95adeca78, this is correct ).
// ✔ so make a query, like type of ids should be in lower case.
// ✔ These placeholders will be replaced in backend using JSON.stringify().


// ------------------------------------
// OUTPUT FORMAT (MANDATORY)
// ------------------------------------
// {
//   "sql": "<SQL QUERY>",
//   "flux": "<FLUX QUERY TEMPLATE>"
// }

// ------------------------------------
// EXAMPLES
// ------------------------------------

// USER INPUT: "What is temperature of engine2 today?"

// OUTPUT:
// {
//   "sql": "SELECT Lower(a.AssetId) as AssetId, Lower(m.SignalTypeId) as SignalTypeId FROM Assets a JOIN MappingTable m ON a.AssetId = m.AssetId WHERE REPLACE(LOWER(a.Name),' ','') = 'engine2'",
//   "flux": "from(bucket: \"SignalValueTeleMentry\") |> range(start: -24h) |> filter(fn: (r) => contains(value: r.assetId, set: ASSET_IDS)) |> filter(fn: (r) => contains(value: r.signalTypeId, set: SIGNAL_TYPE_IDS)) "
// }

// USER INPUT: "Status of Engine 3 in last 3 hours"

// OUTPUT:
// {
//   "sql": "SELECT Lower(a.AssetId) as AssetId, Lower(m.SignalTypeId) as SignalTypeId FROM Assets a JOIN MappingTable m ON a.AssetId = m.AssetId WHERE REPLACE(LOWER(a.Name),' ','') = 'engine3'",
//   "flux": "from(bucket: \"SignalValueTeleMentry\") |> range(start: -3h) |> filter(fn: (r) => contains(value: r.assetId, set: ASSET_IDS)) |> filter(fn: (r) => contains(value: r.signalTypeId, set: SIGNAL_TYPE_IDS)) "
// }
  `;

  // Call your existing groq service (same as in your code)
  try {
    const llmResp = await groqService.chatWithGroq(userQuery, systemPrompt, {
      model: "llama-3.1-8b-instant",
    });
    console.log("LLM Response:", llmResp.choices?.[0]?.message?.content);
    const text = llmResp.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("LLM response not valid JSON");

    const parsed = JSON.parse(jsonMatch[0]);
    console.log("Parsed LLM Output:", parsed);
    return { generated: { sql: parsed.sql, flux: parsed.flux } };
  } catch (err) {
    return { error: `LLM generation failed: ${err.message}` };
  }
}

// ---------- Node: run SQL to get asset/signal ids ----------
async function runSqlNode(state) {
  if (!state.generated || !state.generated.sql) {
    return { error: "No generated SQL available" };
  }

  console.log("Inside runSqlNode function");
  console.log("Generated SQL:", state.generated.sql);

  try {
    const rows = await executeSql(state.generated.sql);
    return { sqlRows: rows || [] };
  } catch (err) {
    return { error: `SQL execution failed: ${err.message}` };
  }
}

// ---------- Node: build flux query string & run it ----------
async function runFluxNode(state) {
  console.log("Inside runFluxNode function");
  console.log("State at runFluxNode:", state.generated.flux);
  if (!state.generated || !state.generated.flux) {
    return { error: "No generated Flux available" };
  }
  if (!state.sqlRows || state.sqlRows.length === 0) {
    return { fluxRaw: [] }; // nothing to query
  }

  // --- Build lowercase id lists (important) ---
  const assetIds = state.sqlRows
    .map((r) => String(r.AssetId || r.assetId || r.assetid || ""))
    .filter(Boolean)
    .map((id) => id.toLowerCase());

  const signalTypeIds = state.sqlRows
    .map((r) => String(r.SignalTypeId || r.signalTypeId || r.signaltypeid || ""))
    .filter(Boolean)
    .map((id) => id.toLowerCase());

  // --- Prepare as JSON array literals expected by Flux contains(..., set: [...])
  // e.g. ["a68e72ec-...","..."]
  const assetIdsLiteral = `[${assetIds.map((v) => `"${v}"`).join(",")}]`;
  const signalTypeIdsLiteral = `[${signalTypeIds.map((v) => `"${v}"`).join(",")}]`;

  // --- Replace placeholders (keep TIME_RANGE handling) ---
  let fluxQuery = state.generated.flux
    .replace("ASSET_IDS", assetIdsLiteral)
    .replace("SIGNAL_TYPE_IDS", signalTypeIdsLiteral);

    console.log("Generated Flux Query before TIME_RANGE check:", fluxQuery);

  // If TIME_RANGE still a placeholder, set a safe default
  fluxQuery = fluxQuery.replace("TIME_RANGE", "-24h");

  // --- DEBUG: log the final Flux query to confirm it looks correct ---

  try {
    const result = [];
    // Option A: iterateRows (your current approach)
    for await (const row of queryApi.iterateRows(fluxQuery)) {
      result.push(row);
    }

    // Debug: if empty, log a hint
    if (result.length === 0) {
      console.warn("Flux query returned 0 rows. Check the query above in Influx UI and verify assetId/signalTypeId case.");
    }

    return { fluxRaw: result };
  } catch (err) {
    console.error("Flux execution error:", err);
    return { error: `Flux execution failed: ${err.message}` };
  }
}

// ---------- Node: normalize/extract values ----------
async function transformNode(state) {
  if (!state.fluxRaw) return { cleaned: [] };

  try {
    const cleaned = extractSignalValues(state.fluxRaw);
    console
    return { cleaned };
  } catch (err) {
    return { error: `Transform failed: ${err.message}` };
  }
}

// ---------- Node: final response formatting ----------
async function respondNode(state) {
  // Build a deterministic, structured result
  const response = {
    userQuery: state.userQuery,
    cleanedSignals: state.cleaned ?? [],
    error: state.error ?? null,
    // Optionally augment with summary stats:
    summary: {
      signalsCount: (state.cleaned || []).length,
    },
  };


  // The node returns the new state fragment; the compiled graph invocation returns whole state
  return { response };
}

// ---------- Build and compile the graph ----------
export function buildQueryGraph() {
  const agent = new StateGraph(GraphState)
    .addNode("llmGenerate", llmGenerate)
    .addNode("runSql", runSqlNode)
    .addNode("runFlux", runFluxNode)
    .addNode("transform", transformNode)
    .addNode("respond", respondNode)
    // Execution order: START -> llmGenerate -> runSql -> runFlux -> transform -> respond -> END
    .addEdge(START, "llmGenerate")
    .addEdge("llmGenerate", "runSql")
    .addEdge("runSql", "runFlux")
    .addEdge("runFlux", "transform")
    .addEdge("transform", "respond")
    .addEdge("respond", END)
    .compile(); 

  return agent;
}

// ---------- Top-level exported handler ----------
export async function   handleUserQueryWithLangGraph(userQuery) {
  console.log("Inside handleUserQueryWithLangGraph function");
  const agent = buildQueryGraph();

  // Initial state
  const initialState = { userQuery };

  const resultState = await agent.invoke(initialState);


  // If your respondNode produced the final response, return just that object.
  if (resultState && typeof resultState === "object" && resultState.cleaned != null) {
    return {
      userQuery: resultState?.userQuery,
      cleanedSignals: resultState?.cleaned ||[],
      error:resultState?.error??null,
      summary:{
        signalsCount:(resultState?.cleaned || []).length
      }
    };
  }

  // Fallback: return a minimal shaped object (do NOT return full resultState)

  return {
    userQuery ,
    cleanedSignals: [],
    error: resultState?.error ?? "No response produced by graph",
    summary: { signalsCount: 0 },
  };
}


// --- Execute SQL Server query ---
async function executeSql(sqlQuery) {

  console.log("Executing SQL Query:", sqlQuery);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(sqlQuery);
    return result.recordset;
  } finally {
    if (pool) await pool.close();
  }
}





