import type { Env } from "../types";

/**
 * The Inngest jobs called Gemini through the Vercel AI SDK. On Workers we hit
 * the REST endpoint directly (no Node deps), and fall back to Workers AI when
 * no Gemini key is configured so the AI features still work out of the box.
 */
const DEFAULT_GEMINI = "gemini-2.5-flash";
const DEFAULT_WORKERS_AI = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const aiProvider = (env: Env) =>
  env.GOOGLE_GENERATIVE_AI_API_KEY ? "gemini" : env.AI ? "workers-ai" : "none";

const viaGemini = async (env: Env, prompt: string): Promise<string> => {
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GOOGLE_GENERATIVE_AI_API_KEY!,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          // 2.5-flash thinks by default, which tripled latency (~30s vs ~10s)
          // on the timetable prompt and pushed the job past its budget. These
          // are structured-output tasks, so the reasoning pass buys nothing.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = (await res.json()) as any;
  const text = body?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
};

const viaWorkersAI = async (env: Env, prompt: string): Promise<string> => {
  const model = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI;
  const res = (await env.AI.run(model as any, {
    messages: [
      {
        role: "system",
        content: "You are a precise assistant. Reply with raw JSON only. No markdown, no prose.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 4096,
  })) as any;
  const text = res?.response ?? res?.result?.response;
  if (!text) throw new Error("Workers AI returned an empty response");
  return text;
};

export const generateText = async (env: Env, prompt: string): Promise<string> => {
  const provider = aiProvider(env);
  if (provider === "gemini") return viaGemini(env, prompt);
  if (provider === "workers-ai") return viaWorkersAI(env, prompt);
  throw new Error(
    "No AI provider configured. Set the GOOGLE_GENERATIVE_AI_API_KEY secret or enable the AI binding.",
  );
};

/**
 * Models still wrap JSON in code fences now and then, and sometimes add a
 * sentence either side of it. Strip the fences, then fall back to slicing the
 * outermost bracket pair.
 */
export const parseJsonResponse = <T>(text: string): T => {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start === -1 || end <= start) {
      throw new Error(`Model did not return JSON: ${cleaned.slice(0, 300)}`);
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
};

export const generateJson = async <T>(env: Env, prompt: string): Promise<T> =>
  parseJsonResponse<T>(await generateText(env, prompt));
