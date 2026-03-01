**Frontend Architecture**

Overview
- **Purpose**: The frontend provides the user-facing UI for the Mediloon ordering assistant: scanning, cart/checkout flow, conversational UI, and admin/observability pages.
- **Location in repo**: frontend/ (index.html, src/, package.json, output.css)

Stack
- **Tooling**: Vite (fast dev server + bundler) used in this repo for building and serving the frontend.
- **Styling**: Tailwind CSS for utility-first styling; postcss for processing.
- **Languages**: JavaScript/TypeScript depending on the repo; components are standard web modules under `src/`.

Folder structure (typical)
- `index.html` — app entry HTML.
- `src/` — application source code (components, views, services, utils).
- `public/` — static assets.
- `package.json` — scripts and dependencies.

Core responsibilities
- Render UI screens: scan to cart, browse medicines, cart summary, checkout, pharmacist persona views, admin pages.
- Capture user interactions and events (clicks, scans, uploads) and send them to the backend via REST/HTTP API.
- Manage local UI state (cart contents, user session/token, temporary UI state for conversations).

How the Frontend uses APIs
- The frontend calls backend HTTP endpoints (the API) to:
  - Fetch product/medicine catalog and metadata.
  - Submit and update orders (create cart, add/remove items, checkout).
  - Authenticate users (login / token refresh) or act as a guest session.
  - Upload images (e.g., scanned prescriptions) and receive OCR extraction results.
  - Fetch conversation history, agent responses, and observation/telemetry links.
- Communication patterns:
  - REST (JSON request/response) is the primary path for CRUD operations.
  - For streaming or agentic conversation responses, the frontend may open WebSocket or Server-Sent Events (SSE) endpoints if supported by the backend. If not available, polling with short intervals is an acceptable fallback.

Authentication and session handling
- The frontend stores an access token (short-lived) and optional refresh token in memory or secure storage (HttpOnly cookies recommended for production) and sends the token via `Authorization: Bearer <token>` header on API calls.
- For guest flows, a temporary session ID is generated, saved in localStorage, and sent to the backend to keep the cart state.

State management
- Small apps: use local component state + `localStorage` for persistence.
- Medium/large apps: use a global state manager (Redux/Pinia/Context + hooks) for cart, user profile, and conversation state.

Error handling and UX
- Show clear, actionable errors for network failures, validation errors, and auth failures.
- Optimistic updates for adding/removing items from cart, with rollback on API failure.

Testing
- Unit tests for components (Jest, Vitest) and UI behaviour.
- End-to-end tests (Cypress / Playwright) for core flows: scan-to-cart, checkout, conversation flows.

Build & Deployment
- Development: `npm run dev` (Vite dev server)
- Production build: `npm run build` → outputs static assets (dist/) to be served by a static hosting provider (Netlify, Vercel) or a CDN behind the backend.
- CI: run lint, unit tests, and build step; deploy artifacts to hosting.

Observability
- The frontend emits user events and telemetry (clicks, errors, conversation traces) to an observability endpoint (e.g., the backend `observability_routes`), or directly to a third-party (Langfuse) if configured.

Integration notes (repo-specific)
- This repo has `output.css`, `postcss.config.js`, `tailwind.config.js`, and `vite.config.js` — standard Tailwind + Vite setup. Ensure `package.json` scripts align with CI and hosting.

Security considerations
- Serve the app over HTTPS.
- Store authentication tokens securely (prefer HttpOnly cookies).
- Sanitize and limit file uploads (size/type) before sending to the backend.

What to include in evaluation
- Describe flows visually (sequence diagrams): user → frontend → API → backend → DB/agents.
- Show example API calls for fetch catalog, add to cart, checkout, and upload prescription.
- Provide screenshots or minimal UI wireframes if required.

Quick sample API call (frontend)

POST /api/cart/add
Request headers: `Authorization: Bearer <token>`
Request body (JSON): {"product_id": "abc123", "qty": 2}

Response (200): {"cart_id":"c1","items":[{"product_id":"abc123","qty":2}],"total":199.98}

