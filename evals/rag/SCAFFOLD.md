# RAG-surface evals — scaffold only

## Why this isn't wired into `npm run evals`

Two separate reasons, for the two separate real surfaces this domain
covers (see `SKILL.md` for the full explanation):

- Embeddings/reranking primitives are **already functional** —
  they're tested in `evals/self-conformance/cases.json` against the real
  `openai_embeddings` and `embedding_similarity_reranking` conformance
  cases. There is nothing to scaffold there.
- Workspace's internal semantic-excerpt injection requires a live
  `web_workspace` session with the exact supported Nomic embedding row
  loaded — `mock-server/server.ts` only serves the chat/embeddings HTTP
  surface, not a stateful workspace session with an internal source index.
  Faking that index's behavior would test the fake, not Camelid's real
  (and only lazily-built, condition-gated) index.

## What would need to be true to graduate this

1. A live Camelid instance with `web_workspace` enabled and the exact
   supported Nomic Embed Text v1.5 Q8_0 row loaded.
2. A real workspace source root containing files varied enough that
   semantic relevance (embedding-based) and lexical relevance (fallback
   path) would sometimes disagree — so a case can actually distinguish
   which path fired.
3. A way to observe, from the session's own output, whether an excerpt was
   injected via the semantic path vs. the lexical fallback, and whether it
   was marked untrusted — this may require reading session/thread
   transcripts via `GET /api/agent/workspace/threads/:id` rather than just
   the final answer.

## Case shape

See `cases.schema.json` and `cases.example.json`. Note this schema is
deliberately narrower than a generic "RAG eval" schema — it only has
fields for the two things Camelid actually claims.
