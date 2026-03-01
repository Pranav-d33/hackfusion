**Backend Architecture**

Overview
- **Purpose**: The backend implements API endpoints, business logic, data persistence, agent orchestration (ordering, procurement, forecasting), observability, and integrations (OCR, Langfuse, Firebase, vector DBs).
- **Location in repo**: backend/ (routes/, services/, agents/, db/, main.py, config.py)

Stack
- **Language**: Python (the repo contains `main.py`, `routes/`, and `services/` folders).
- **Web framework**: The codebase uses a minimal HTTP server pattern; it resembles FastAPI/Flask patterns — confirm in `main.py` for exact framework. Regardless, the backend exposes REST endpoints under `/routes/`.
- **Data**: Relational DB (SQL schema in `db/schema.sql`) and seed data utilities in `db/seed_data.py`. Vector DB (Chroma) is present under `data/chroma_db/` for embedding/semantic search.
- **Integrations**: Firebase admin SDK credentials present (hackfusion-...firebase-adminsdk...), Langfuse client (observability/langfuse_client.py), OCR models and tests, and agent modules under `backend/agents`.

High-level components
- `main.py` — app entrypoint: registers routes, middleware, and starts the HTTP server.
- `routes/` — route handlers grouped by domain: `agent_routes.py`, `procurement_routes.py`, `warehouse_routes.py`, `observability_routes.py`, `upload_routes.py`, etc.
- `services/` — business logic used by routes: `event_service.py`, `planner_service.py`, etc.
- `agents/` — agent implementations (ordering_agent.py, procurement_agent.py, forecast_agent.py, ui_agent.py, safety_agent.py) that encapsulate multi-step flows and orchestrations.
- `db/` — database connection and migration/ingest scripts.
- `nlu/` — natural language understanding and extraction utilities.

APIs: what they are, why, and how they're used
- What is an API: an Application Programming Interface (HTTP endpoints here) — the contract the frontend and external systems use to request data or trigger actions.
- Why used:
  - Decouple frontend UI from backend logic and data stores.
  - Provide stable, versioned endpoints for integrations (mobile apps, third-party services, observability pipelines).
  - Centralize business rules (pricing, validation, inventory checks, agent orchestration).
- How it connects:
  - Frontend → Backend: HTTP REST calls (JSON) to routes in `backend/routes/`.
  - Backend → DB: via `db/database.py` (SQL queries and ORM/connection pool).
  - Backend → Agents: some routes trigger agents (e.g., ordering flows) implemented in `backend/agents` which may call external ML/LLM services.
  - Backend → Third-party: calls to Firebase, Langfuse, OCR models, or vector DBs for embeddings and search.

Key API groups (common in this codebase)
- `/api/catalog` — fetch catalogs, search products.
- `/api/cart` — create/update cart, add/remove items, compute totals.
- `/api/orders` — place orders, check status, fetch history.
- `/api/upload` — upload prescription images, return OCR/extraction results.
- `/api/agents` — start or query agent conversations and orchestrations.
- `/api/observability` — push telemetry and get traces.

Agent architecture
- Agents encapsulate multi-step flows: they take input, call models/services (NLP, forecasting, procurement), maintain ephemeral state and return results or next steps.
- Agents may be synchronous for quick tasks or asynchronous (background jobs, message queue) for longer orchestration.

Data persistence
- Relational DB for product metadata, orders, user profiles (see `db/schema.sql`).
- Seed and migration scripts exist in `db/` for reproducible setups.
- Vector DB (Chroma) for semantic retrieval of documents/medicines.

Security & Auth
- Authentication endpoints for user login and token issuance (or guest-session). Use JWTs or session tokens.
- Validate uploaded files (type, size) and scan for common threats.

Background jobs and async processing
- Long-running tasks (e.g., heavy OCR, large ML inferences, procurement pipelines) should be offloaded to a worker (Celery, RQ, or background threads/processes) and reported back via events or database polling.

Observability
- Use `observability/langfuse_client.py` to send structured traces and events to Langfuse (or another tracing backend).
- Log structured events and errors; capture request IDs and propagate them across services for correlation.

Testing
- Unit tests are under `backend/` (many `test_*.py` files). Run them with `pytest`.

Deployment
- The backend runs as a Python service behind a WSGI/ASGI server (e.g., Uvicorn/Gunicorn) depending on framework.
- Use environment variables for secrets (DB url, Firebase credentials path, Langfuse key). `config.py` centralizes configuration settings.
- Containerization: provide a Dockerfile to run the app and a docker-compose for local dev including DB and vector DB.

Example API: add item to cart

POST /api/cart/add
Headers: `Authorization: Bearer <token>`
Body: {"product_id":"abc123","qty":2}

Backend flow:
- Route handler validates input → calls `services/cart_service.add_item()` → updates DB → returns updated cart JSON.

How to verify repository specifics (quick checks you can run)
- Open `backend/main.py` to confirm the web framework and startup command.
- Inspect `backend/routes/` to list the exact endpoints.
- Run tests: `pytest -q` from repo root.

Security & compliance notes for evaluation
- Ensure PHI/PII handling policies if user health data is processed.
- Audit logs for order edits and prescription uploads.

Ops & run commands (examples)
- Create virtual env and install deps:
  - `python -m venv .venv`
  - `source .venv/bin/activate`
  - `pip install -r backend/requirements.txt`
- Run tests: `pytest -q`
- Start dev server (example): `uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`

Documentation to include in evaluation
- Sequence diagrams: frontend → API → DB/Agents
- Example curl commands for core flows
- Environment variable list and required secrets
- Deployment diagram (hosting for frontend, backend, DB, and workers)
