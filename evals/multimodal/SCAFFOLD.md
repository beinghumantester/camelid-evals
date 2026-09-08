# Multimodal (vision) evals — scaffold only

## Why this isn't wired into `npm run evals`

`mock-server/server.ts` serves text-only chat completions. Vision support
in real Camelid is gated to a specific component (Prism) on exactly two
hardware execution paths (Metal, Windows CUDA) with a real image-decoding
and cross-modal-attention pipeline behind it — there is no honest way to
mock "does the model actually see the image" without the mock itself
deciding the answer, which would test the mock's canned response, not
Camelid's real vision path.

## What would need to be true to graduate this

1. A live Camelid instance running on either macOS (Metal) or Windows
   (CUDA) — not the Linux box this project's mock server currently targets
   — with a vision-capable model loaded.
2. A small set of real test images, each with a genuinely verifiable
   answer (e.g. an image containing a specific number or word), encoded as
   data URLs.
3. A grader that checks the model's answer against the image's actual
   content — this is a semantic/LLM-judged check like
   `evidence-audit`/`model-compatibility`, not a pure structural probe,
   since "did it correctly describe the image" isn't a shape check.
4. Separate negative cases that deliberately send two images, a remote
   URL, or an image+tool-call combo, and confirm each is rejected or
   degraded per the real unsupported-mode list — these CAN be structural
   checks (status code / error shape) rather than semantic ones.

## Case shape

See `cases.schema.json` and `cases.example.json`.
