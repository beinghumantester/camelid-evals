import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelProfile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

let cached: { activeProfileId: string; profiles: ModelProfile[] } | undefined;

/** Loads fixtures/model-profiles.json. The active profile gates which cases are even
 * attempted — a case whose required capability the active profile lacks is reported BLOCKED,
 * never silently omitted (BASELINE_EVAL_PLAN.md principle #10). */
export function loadProfiles(): { activeProfileId: string; profiles: ModelProfile[] } {
  if (!cached) {
    cached = JSON.parse(readFileSync(join(ROOT, "fixtures", "model-profiles.json"), "utf8"));
  }
  return cached!;
}

export function getActiveProfile(): ModelProfile {
  const { activeProfileId, profiles } = loadProfiles();
  const overrideId = process.env.CAMELID_MODEL_PROFILE ?? activeProfileId;
  const profile = profiles.find((p) => p.id === overrideId);
  if (!profile) {
    throw new Error(`No model profile with id '${overrideId}' in fixtures/model-profiles.json. Add it rather than guessing its capabilities.`);
  }
  return profile;
}

/** Returns a BLOCKED reason string if the active profile lacks a required capability, else undefined. */
export function blockedByProfile(requiredCapability: keyof ModelProfile["capabilities"]): string | undefined {
  const profile = getActiveProfile();
  if (!profile.capabilities[requiredCapability]) {
    return `BLOCKED — reason: required capability '${requiredCapability}' unavailable in current model profile '${profile.id}' (loaded row: ${profile.ledgerRowId}).`;
  }
  return undefined;
}
