import groqService from "./groq.service.js";

export async function generateRCAWithLLM(state) {


 
  const systemPrompt = `
You are an industrial Root Cause Analysis assistant for factory operators.

Rules:
- Use ONLY the provided observations and detected causes.
- strictly Do NOT invent new issues or causes.
- Explain in simple, clear, professional language.
- Do NOT return JSON.
- Always structure the response as:

1. What happened
2. Why it happened
3. Impact on the machine
4. Recommended actions based on past RCA
`;

  const assetName = Object.keys(state.input.assets)[0];

const userPrompt = `

userQuery: ${state.userQuery}

Asset: ${assetName}

Observed anomalies:
${state.observations.observations.map(o => `- ${o}`).join("\n")}

Detected root causes:
${state.correlations.map(c =>
  `- ${c.cause} (confidence ${Math.round(c.confidence * 100)}%)`
).join("\n")}

Detected Recommended actions based on history of RCA:
${state.historyMatches.recommendedActions.map(o => `- ${o}`).join("\n")}

Generate a concise RCA in 4 points:
1. What happened (include numeric ranges)
2. Why it happened (root causes with confidence)
3. Impact on machine
4. Recommended actions (max 3 steps)

Keep it very veryshort and operator-friendly. Do NOT return JSON.
`;


  const llmResp = await groqService.chatWithGroq(
    systemPrompt,
    userPrompt,
    {
      model: "llama-3.1-8b-instant"
    }
  );

    return llmResp.choices?.[0]?.message?.content || "RCA explanation could not be generated.";

}
