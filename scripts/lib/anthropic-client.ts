import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CAMELID_EVALS_MODEL ?? "claude-sonnet-4-5";
const JUDGE_MODEL = process.env.CAMELID_EVALS_JUDGE_MODEL ?? MODEL;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** Runs a skill: skillMd as system prompt, real ground-truth data plus the eval's prompt as the user turn. */
export async function runSkill(skillMd: string, groundTruth: unknown, userPrompt: string): Promise<string> {
  const anthropic = client();
  const contextualPrompt = `${userPrompt}\n\n<ground_truth>\n${JSON.stringify(groundTruth, null, 2)}\n</ground_truth>`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: skillMd,
    messages: [{ role: "user", content: contextualPrompt }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export interface JudgeVerdict {
  verdict: "PASS" | "FAIL";
  reasons: string[];
}

async function judgeOnce(prompt: string, answerText: string, expectations: string[]): Promise<JudgeVerdict> {
  const anthropic = client();
  const rubric = expectations.map((e, i) => `${i + 1}. ${e}`).join("\n");

  const response = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 512,
    system:
      "You are a strict, literal grader. Given a user prompt, a model's answer, and a numbered list of expectations, decide whether the answer satisfies EVERY expectation. Respond with ONLY a JSON object of the shape " +
      '{"verdict": "PASS" | "FAIL", "reasons": string[]} ' +
      "with no other text. `reasons` must explain any expectation that failed, or be an empty array if verdict is PASS.",
    messages: [{ role: "user", content: `PROMPT:\n${prompt}\n\nANSWER:\n${answerText}\n\nEXPECTATIONS (all must hold):\n${rubric}` }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    return { verdict: parsed.verdict === "PASS" ? "PASS" : "FAIL", reasons: parsed.reasons ?? [] };
  } catch {
    return { verdict: "FAIL", reasons: [`Judge returned unparseable output: ${text.slice(0, 200)}`] };
  }
}

/** Runs the judge up to three times and takes the majority verdict, to damp a single flaky judge call. */
export async function judgeWithVoting(prompt: string, answerText: string, expectations: string[]): Promise<JudgeVerdict> {
  const first = await judgeOnce(prompt, answerText, expectations);
  const second = await judgeOnce(prompt, answerText, expectations);
  if (first.verdict === second.verdict) return { verdict: first.verdict, reasons: [...first.reasons, ...second.reasons] };
  const third = await judgeOnce(prompt, answerText, expectations);
  const votes = [first, second, third];
  const passCount = votes.filter((v) => v.verdict === "PASS").length;
  return { verdict: passCount >= 2 ? "PASS" : "FAIL", reasons: votes.flatMap((v) => v.reasons) };
}
