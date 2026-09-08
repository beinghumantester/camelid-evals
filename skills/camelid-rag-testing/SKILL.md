---
name: camelid-rag-testing
description: SCAFFOLD ONLY — evaluation discipline for Camelid's actual RAG-shaped surface (embeddings/reranking primitives, plus workspace's internal semantic excerpt injection), and an explicit correction of the assumption that Camelid has a general-purpose RAG pipeline.
---

# Camelid RAG-Surface Auditor (scaffold only)

## Status

**This skill is not executable**, and — more importantly — **most of what
"RAG testing" usually means doesn't apply to Camelid as a standalone
claim.** This file exists as much to correct scope creep as to scaffold a
future eval. Absent from `scripts/run-harness.ts`'s domain list.

## What Camelid actually has, and what it doesn't

Searching the real source (`src/`) for a retrieval/vector-store/RAG
subsystem outside the two known surfaces below turns up nothing — no
standalone chunking pipeline, no persistent vector database, no
retrieval-quality claim of any kind. Camelid's real RAG-adjacent surface is
exactly two things, and they are not the same thing:

1. **Embeddings and reranking primitives** — the real
   `openai_embeddings` and `embedding_similarity_reranking` conformance
   cases (`fixtures/api-conformance-registry.json`), gated to the exact
   Nomic Embed Text v1.5 Q8_0 catalog row, using
   `search_query`/`search_document` prefix conventions for a *bi-encoder*
   embedding-similarity reranker — explicitly **not** a classifier-head
   cross-encoder. **This part is already functional** — it's tested today
   in `evals/self-conformance/cases.json` (cases for `openai_embeddings`
   and `embedding_similarity_reranking`). Nothing new needs scaffolding
   here; a case asking "does Camelid embed and rerank text" belongs in
   self-conformance, not here.
2. **Workspace's internal semantic excerpt injection** — the real
   `web_workspace` contract states that "when the exact supported Nomic
   embedding row is also loaded, each session lazily builds a bounded
   read-only in-memory source index and injects semantically relevant,
   explicitly untrusted excerpts before model execution; absence/failure
   degrades to the existing lexical path." This *is* RAG-shaped behavior —
   but it is internal to a workspace session, conditional on a specific
   embedding row being loaded, bounded and read-only, and the contract
   explicitly disclaims "no... persistent vector database, broad
   retrieval-quality... claim." This is the part that's genuinely scaffold
   material: it needs a live workspace session with the exact embedding
   row loaded to observe at all.

Anything beyond these two — chunking strategy quality, retrieval recall
against a large corpus, ranking of retrieved passages by relevance score,
vector database durability — is not a claim Camelid makes about itself.
An eval that tests for those would be testing a *hypothetical* RAG
pipeline, not Camelid.

## Guardrails (to carry forward when this graduates to executable)

1. **Never re-test embeddings/reranking primitives here.** They're
   functional in `evals/self-conformance/`. This domain is only for the
   workspace's internal excerpt-injection behavior.
2. **Never assert a persistent-vector-database or broad
   retrieval-quality claim.** The real contract explicitly disclaims both;
   a case expecting them is testing something Camelid doesn't claim to do.
3. **Confirm the exact embedding row is loaded before testing excerpt
   injection.** Per the contract, injection only happens "when the exact
   supported Nomic embedding row is also loaded" — absence degrades
   silently to lexical search, which is correct fallback behavior, not a
   bug, and a case must not conflate the two paths.
4. **Injected excerpts must be treated as "explicitly untrusted" in any
   downstream judgment** — never grade a case as if workspace-injected
   content were as trustworthy as the user's own instructions.
5. **The index is bounded and read-only.** Never expect it to grow
   unboundedly, persist across sessions, or accept writes.
6. **No release/adoption authority.** State what the real excerpt-index
   behavior showed; leave the decision to rely on it to the human asking.

## Instructions (for the future executable version)

1. Confirm whether the case under test is actually about embeddings/
   reranking primitives (→ redirect to self-conformance, don't build it
   here) or about workspace's internal excerpt injection (→ this domain).
2. For excerpt-injection cases: confirm via the live instance whether the
   exact supported Nomic row is loaded; if not, expect and grade the
   lexical fallback path, not injection.
3. If injection is active, verify excerpts are marked untrusted in
   whatever the session exposes, and that the index stays bounded across a
   multi-turn session rather than growing without limit.
4. Cite the exact embedding row's real ledger status and the exact session
   behavior observed, so the result is auditable.
