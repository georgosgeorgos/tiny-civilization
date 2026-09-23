import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_OPENROUTER_MODEL, interpretCouncilInstruction } from "../openrouter.ts";

const context = { year: 7, people: 12, housing: 14, food: 8, wood: 20, gold: 30, mood: 55 };

test("OpenRouter maps a council proposal to bounded simulation directives", async () => {
  let request: RequestInit | undefined;
  let endpoint = "";
  const fetcher: typeof fetch = async (url, init) => {
    endpoint = String(url);
    request = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      directives: ["food", "growth", "food"], explanation: "Feed families before expanding.",
    }) } }] }), { status: 200 });
  };
  const result = await interpretCouncilInstruction("Help families through winter", context, "private-key", undefined, fetcher);
  assert.deepEqual(result, { directives: ["food", "growth"], explanation: "Feed families before expanding." });
  assert.equal(endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal((request?.headers as Record<string, string>).Authorization, "Bearer private-key");
  const body = JSON.parse(String(request?.body));
  assert.equal(body.model, DEFAULT_OPENROUTER_MODEL);
  assert.equal(body.messages[1].role, "user");
  assert.deepEqual(JSON.parse(body.messages[1].content).settlement, context);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.provider.require_parameters, true);
});

test("OpenRouter responses cannot introduce unsupported simulation actions", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    directives: ["grant_gold"], explanation: "Free resources.",
  }) } }] }), { status: 200 });
  await assert.rejects(
    interpretCouncilInstruction("give us gold", context, "private-key", DEFAULT_OPENROUTER_MODEL, fetcher),
    /unsupported council instructions/,
  );
});

test("OpenRouter errors preserve a clear failure and never request without a key", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return new Response("", { status: 401 }); };
  await assert.rejects(interpretCouncilInstruction("secure food", context, "", undefined, fetcher), /Enter an OpenRouter API key/);
  assert.equal(calls, 0);
  await assert.rejects(interpretCouncilInstruction("secure food", context, "bad-key", undefined, fetcher), /OpenRouter request failed \(401\)/);
  assert.equal(calls, 1);
});
