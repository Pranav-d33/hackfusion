**Agent Architecture**

This document describes the agent architecture used by the Mediloon project, the framework and runtime choices, which agents have access to which tools, how agents are connected, and the safety/guardrail patterns we use to mitigate hallucinations and prompt-injection.

**Overview**:
- **Architecture Type:** LLM-first, single-turn LLM agents with a lightweight orchestrator and explicit safety/validation agents.
- **Placement:** Agents are implemented in [backend/agents](backend/agents).
- **Primary flow:** Input → Input Guard (safety_agent) → Orchestrator → LLM agent (`ordering_agent`) → Tool execution → Output Guard → Response.

**Framework & Stack**:
- **Python service**: all agents run inside the backend Python application.
- **LLM Providers**: Groq + OpenRouter (configured in [`backend/config.py`](backend/config.py)).
- **Observability**: Optional Langfuse integration via `observability/langfuse_client.py`.
- **Tools & Services**: Internal helper modules under `backend/tools` and `backend/services` (e.g. `tools.query_tools`, `tools.cart_tools`, `services/event_service.py`, `db/database.py`).

**Primary Agents (who does what)**n+- `ordering_agent` — Main LLM-driven agent (see [backend/agents/ordering_agent.py](backend/agents/ordering_agent.py)). It receives the full conversation history and returns a strict JSON action object. It is NOT responsible for enforcement of guardrails — it must follow prompts and system rules but final checks are external.
- `orchestrator` — Coordination layer (see [backend/agents/orchestrator.py](backend/agents/orchestrator.py)). Implements the runtime pipeline: run input safety checks, call `ordering_agent.handle(...)`, map returned `action` to a tool call, then run output guards and logging.
- `safety_agent` — Pre- and post-action validation and enforcement (see [backend/agents/safety_agent.py](backend/agents/safety_agent.py)). Blocks unsafe inputs (medical advice, antibiotic requests), enforces RX rules, validates substitutions, and verifies prescriptions via OCR results.
- `ui_agent` — Helper to validate and normalize UI-driven actions (selection clicks, language/formatting for UI presentation).
- `forecast_agent`, `procurement_agent`, `procurement_agent` — domain-specific automation agents (forecasting stock, procurement flows) with restricted tool access.
- `orchestrator_old` — legacy flow retained for reference; new pipeline uses `orchestrator.py`.

**Tool Access Matrix**
- `ordering_agent`: read-only access to the session state injected in prompt; may request actions expressed as `tool_call` actions. The agent itself does not directly call DB/APIs — the `orchestrator` maps agent `tool_call` actions to internal `tools.*` functions.
- `orchestrator`: has privileged access to `tools.query_tools`, `tools.cart_tools`, trace/log utilities and to `services` (for example, `services.event_service` for audit logs).
- `safety_agent`: can call `services.event_service` to log guardrail triggers, has access to RX enforcement flags from `config.py`, and can call `ocr_service` via `services` for prescription verification.
- Domain agents (`forecast_agent`, `procurement_agent`): access to forecasting services and procurement APIs, but are isolated from direct order-confirmation actions unless orchestrator permits it.

Notes:
- The single-LLM design means the `ordering_agent` receives full context and returns structured actions (see `ORDERING_SYSTEM_PROMPT` in `ordering_agent.py`). The orchestrator is responsible for translating those structured actions into deterministic tool calls.
- Tools are implemented as explicit modules (`tools/query_tools.py`, `tools/cart_tools.py`, `tools/trace_tools.py`) so the LLM never talks directly to system libraries — it only emits an action name and args.

**How agents are connected**
- All agents live inside the backend process and are called synchronously/asynchronously by the `orchestrator` pipeline.
- Typical call flow:
  - HTTP request or websocket message arrives → request handler constructs session state.
  - `orchestrator` runs `safety_agent.check_input_safety(user_input)`.
  - If safe, `orchestrator` constructs messages + `ORDERING_SYSTEM_PROMPT` and calls `ordering_agent.handle(...)`.
  - `ordering_agent` returns JSON action (e.g. `{"action":"tool_call","tool":"vector_search","tool_args":{...}}`).
  - `orchestrator` validates the returned action (static output guards + `safety_agent` checks for specific actions such as `add_to_cart`).
  - `orchestrator` invokes the matching tool function (e.g. `tools.query_tools.vector_search`) and updates session state.
  - Before returning to the user, `orchestrator` runs final output guards and logs the decision to observability.

**Guardrails & Safety**
- **Input Guard**: `safety_agent.check_input_safety()` inspects raw user messages for blocked patterns and antibiotic/risky queries and logs triggers using `services.event_service`.
- **Output Guard**: `orchestrator` enforces static forbidden-output patterns (see `FORBIDDEN_OUTPUT_PATTERNS` in `orchestrator.py`) and runs `safety_agent.validate_add_to_cart()` before letting an `add_to_cart` action proceed.
- **RX enforcement**: Configurable via `config.py` flags (e.g. `RX_ENFORCEMENT_ENABLED`, `RX_BYPASS_ENABLED`). `safety_agent.validate_prescription()` checks OCR results and cart contents.
- **Separation of Concerns**: The LLM decides intent and action, but authorization/validation/execution is performed by deterministic Python code in the orchestrator and safety agent.

**Hallucination Mitigations**
- **Structured output contract**: The `ordering_agent` must return a strict JSON with `action` names. The orchestration layer only accepts recognized actions and explicit tool names.
- **No direct DB creds to LLM**: The LLM never has raw DB or API keys; it only emits tool names — tools perform lookups deterministically.
- **Use of candidate IDs and session state**: The orchestrator relies on catalog IDs from DB and session state; code refuses to invent IDs.
- **Grounding data retrieval**: All factual answers about inventory, price, or prescription requirements come from `tools.query_tools` or `db/database.py` results, not the LLM text.
- **Low temperature / deterministic settings**: LLM calls use conservative temperature and candidate fallbacks (see `ordering_agent._call_groq` and `_call_openrouter`) to reduce creative outputs.
- **Fallback messages**: If parsing LLM output fails, the system returns language-appropriate fallback messages from `ordering_agent` to avoid returning unsafe or incorrect results.

**Prompt-injection mitigations**
- **System prompt dominance**: The `ORDERING_SYSTEM_PROMPT` is a tightly-scoped system instruction — it defines capabilities, forbidden behavior, required JSON schema, and safety rules.
- **Sanitization**: Inputs and session fields are sanitized before being injected into LLM prompts; free-text fields are trimmed and encoded to avoid accidental prompt breaks.
- **Output parsing enforcement**: The orchestrator parses LLM responses strictly (JSON parse + fallback search). If parsing fails, treat as error and run fallback.
- **Don't trust user-provided action suggestions**: The orchestrator re-validates any action the LLM requests (e.g., confirm `med_id` exists and is in session state before `add_to_cart`).

**Observability & Logging**
- **Langfuse**: When enabled, LLM calls and generation spans are recorded (see `observability/langfuse_client.py`) to trace prompts, inputs, and outputs.
- **Event logging**: Guardrail triggers and safety decisions are logged to `services.event_service` for human review.
- **Trace IDs**: The orchestrator uses trace IDs for correlating LLM calls to downstream tool executions (see `tools/trace_tools`).

**Testing & Validation**
- Unit tests: test guardrail rules (`tests/test_guardrails_verified.py`) and agent flows under `backend/tests`.
- Integration tests: run conversation flows that hit `orchestrator` and real tools (see test files in `backend/` root for examples).
- Manual verification: use example prompts from `ORDERING_SYSTEM_PROMPT` to verify the LLM returns valid JSON and the orchestrator maps actions correctly.

**Extending or Adding an Agent**
1. Add agent to `backend/agents/` and register usage in `orchestrator` (or a new coordinator) — keep responsibilities narrow.
2. Add required `tools.*` modules for any external effects; avoid giving direct DB or credentials to the LLM.
3. Add unit tests and update the architecture doc with the new tool access mapping.

**Files of interest (quick links)**
- `backend/agents/ordering_agent.py` — LLM prompt & call patterns.
- `backend/agents/orchestrator.py` — runtime pipeline and guards.
- `backend/agents/safety_agent.py` — input/output safety checks.
- `backend/config.py` — feature flags and keys.
- `backend/tools/` — deterministic tool implementations invoked by orchestrator.
- `backend/services/event_service.py` — logging and guardrail event recording.

**Final notes**
- Keep the LLM role narrow (intent → action). Enforce all safety-critical decisions in deterministic Python code.
- When updating prompts, update tests and observability hooks (Langfuse) to preserve auditability.
