# Otterbot — AI / LLM / RAG / Agent Safety Review

## Verdict: N/A — no AI components present.

A dedicated review agent searched the entire `src/**` tree for any AI/LLM/RAG/agent/
tool-calling/model surface:

```
openai · anthropic · langchain · llm · embedding · gpt · claude · ollama ·
pickle · torch · joblib · completion · huggingface · transformers · tiktoken ·
gemini · cohere · mistral · vector · rag · agent
```

**No inference SDKs, no model files, no prompt construction, no embeddings/vector
store, no tool-calling, no `pickle`/`torch.load`/`joblib` deserialisation** were found.
The only incidental matches were:

- comments referencing the `CLAUDE.md` instructions file (`commands/moveChannel.ts`, `index.ts`),
- an HTTP `User-Agent: otterbot-report` header (`reportReview.ts`),
- ordinary identifiers (e.g. `allMappings`).

Otterbot is a deterministic Discord bot: slash/component handlers → services →
Postgres / Redis / the McKenzie REST API. There is no generative or
retrieval-augmented behavior.

## Consequently, the following GenAI risk classes do not apply:

prompt injection · indirect/retrieved-content injection · system-prompt leakage ·
unsafe tool calling / excessive agency · model output used as code/SQL/shell/HTML ·
vector-DB or cross-user memory leakage · unsafe model downloads / pickle loads ·
inference cost amplification.

## If AI is added later

Should a future feature introduce an LLM (e.g. summarising notes, a support
assistant), revisit this document and add: instruction/data separation, a tool
allowlist with human approval for destructive actions, structured-output
validation, per-business/tenant scoping of any retrieval, PII redaction before
prompts/logs, and prompt-injection regression tests. The existing
`allowedMentions:{parse:[]}` and markdown escapers (`utils/escape.ts`) should be
applied to any model-generated text rendered into Discord.
