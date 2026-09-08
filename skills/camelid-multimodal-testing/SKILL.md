---
name: camelid-multimodal-testing
description: SCAFFOLD ONLY — evaluation discipline for Camelid's real, narrow vision support (single-image, data-URL only, on exactly Metal or Windows CUDA), not yet wired to an executable grader.
---

# Camelid Multimodal-Boundary Auditor (scaffold only)

## Status

**This skill is not executable.** Absent from `scripts/run-harness.ts`'s
domain list. It records the exact, real boundary of Camelid's vision
support so a future grader with a real vision-capable model and image
inputs doesn't have to re-derive it — and so no case ever silently expands
scope beyond what Camelid actually claims.

## Why this boundary is unusually easy to get wrong

The real `openai_chat_completions` conformance case
(`fixtures/api-conformance-registry.json`) lists a supported mode named,
verbatim: `prism_single_image_data_url_metal_or_windows_cuda`. Read
literally, every clause in that identifier is a real constraint, not
decoration:

- **`prism`** — this is Camelid's own name for its vision component; use
  it, don't invent a generic "vision module" label.
- **`single_image`** — exactly one image. The same case's
  `unsupported_modes` explicitly lists `multiple_images` as unsupported —
  a case sending two images and expecting both to be attended to is
  testing a mode Camelid doesn't claim.
- **`data_url`** — the image must be a data URL (embedded, base64-style).
  `unsupported_modes` separately lists `remote_image_urls` — a case
  pointing at an `https://` image URL is, again, testing an unsupported
  mode, not a bug.
- **`metal_or_windows_cuda`** — exactly two execution paths. A vision
  request against a CPU-only or non-Windows-CUDA backend is outside the
  supported gate entirely, and a failure there is expected, not a defect.

The same case's `unsupported_modes` also lists `audio_or_video_input`
(no modality beyond single still images) and `vision_tool_combination`
(a request combining image input with function/tool calling is not a
supported combination, even though both image input and tool calling are
independently supported).

## Guardrails (to carry forward when this graduates to executable)

1. **Every case must state which exact hardware path it ran on** (Metal
   or Windows CUDA) and treat any other backend as out-of-gate, not a
   failure worth reporting as a regression.
2. **Never send more than one image and grade it as if multi-image
   support should exist.** `multiple_images` is real, documented,
   unsupported.
3. **Never use a remote image URL and grade it as if URL-fetching should
   work.** Only `data_url` is the supported input shape.
4. **Never combine image input with tool/function calling in a case
   expected to succeed.** `vision_tool_combination` is explicitly
   unsupported even though each half works alone — a case must test them
   separately if it wants to test each capability.
5. **Never test audio or video input as if it were a smaller version of
   the same vision feature.** It's a categorically unsupported modality,
   not an edge case of image support.
6. **No release/adoption authority.** State exactly which mode, on which
   backend, produced which result; leave the decision to rely on it to
   the human asking.

## Instructions (for the future executable version)

1. Confirm the live instance's execution path is exactly Metal or Windows
   CUDA before running any case — on any other backend, expect and grade
   a typed unsupported/error response, not a vision answer.
2. Encode exactly one image as a data URL per request; never batch
   multiple images into one case expecting both to be used.
3. Keep tool/function-calling requests and vision requests in separate
   cases; a combined request should be graded as correctly rejected or
   correctly degraded, not as a vision+tool success.
4. Cite the exact supported-mode string
   (`prism_single_image_data_url_metal_or_windows_cuda`) or the specific
   unsupported-mode string being tested in every case's result, so the
   result is auditable against the real registry entry.
