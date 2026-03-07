# Medaura — AI-Driven Agentic Pharmacy System

An autonomous pharmacy ecosystem powered by multi-agent AI. Customers order medications through natural voice or text conversation in **English, German, Arabic, and Hindi**. The system predicts refill needs, enforces prescription rules, and autonomously executes backend procurement — with minimal human intervention.

> **Medaura 2026** — AI-Driven Agentic Ordering & Autonomous Pharmacy System

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🎤 **Voice & Text Ordering** | Natural conversation interface with multi-turn context understanding |
| 🌍 **Multi-Language** | English, German (Deutsch), Arabic (العربية), Hindi (हिन्दी) — auto-detected |
| 🤖 **Multi-Agent Architecture** | Ordering, Safety, Forecast, Procurement agents working autonomously |
| 💊 **Safety Enforcement** | Prescription (RX) validation, no medical advice, Tier-1 alternatives only |
| 📈 **Predictive Refills** | Learns from order history, predicts depletion dates, auto-suggests refills |
| 🏭 **Warehouse Fulfillment** | Webhook-triggered fulfillment with auto-procurement on low stock |
| 📊 **Observability** | Full Langfuse tracing — every agent decision is logged and inspectable |
| 🛒 **Cart & Checkout** | Complete ordering flow with Cash on Delivery (COD) |

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────┐
│                    Frontend (React + Vite)          │
│  Chat UI · Voice Overlay · Admin Dashboard          │
│  Prediction Timeline · Cart · Language Selector     │
└──────────────────────┬────────────────────────────┘
                       │ REST API
┌──────────────────────┴────────────────────────────┐
│               FastAPI Backend                      │
│                                                    │
│  ┌─────────────┐  ┌──────────────┐                │
│  │  Ordering    │  │   Safety     │                │
│  │  Agent (LLM) │  │   Agent      │                │
│  └──────┬──────┘  └──────────────┘                │
│         │                                          │
│  ┌──────┴──────┐  ┌──────────────┐                │
│  │ Orchestrator │  │  Forecast    │                │
│  │ (Pipeline)   │  │  Agent       │                │
│  └──────┬──────┘  └──────────────┘                │
│         │                                          │
│  ┌──────┴──────┐  ┌──────────────┐                │
│  │  Tool       │  │ Procurement  │                │
│  │  Executor   │  │ Agent        │──→ Webhooks    │
│  └─────────────┘  └──────────────┘                │
│                                                    │
│  SQLite · ChromaDB · Langfuse                      │
└────────────────────────────────────────────────────┘
```

### Multi-Agent System

| Agent | Role |
|---|---|
| **Ordering Agent** | LLM-powered conversational agent. Understands intent from natural language, manages cart flow, handles multi-turn context. |
| **Safety Agent** | Validates inputs, enforces prescription rules, blocks medical advice, checks drug safety. |
| **Forecast Agent** | Predicts store stock depletion using sales velocity analysis. Triggers proactive alerts. |
| **Procurement Agent** | Auto-generates purchase orders, sends real HTTP webhooks to suppliers, updates inventory on delivery. |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- API Keys (see below)

### 1. Clone & Configure

```bash
git clone <repo-url>
cd medaura

# Create .env in project root
cp .env.example .env
# Edit .env and add your API keys
```

**Required `.env` variables:**
```env
# LLM Providers (at least one required)
GROQ_API_KEY=gsk_...          # Primary — fast, free tier
OPENROUTER_API_KEY=sk-or-...  # Fallback

# Langfuse Observability (REQUIRED for submission)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 2. Start Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
Backend runs at **http://localhost:8000**

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```
Frontend runs at **http://localhost:5173**

---

## 📊 Observability (Langfuse)

Every agent turn is traced with full Chain of Thought:

- **Safety Check** → Input validation result
- **Ordering Agent** → LLM reasoning, action chosen, model used
- **Tool Execution** → Search results, cart operations
- **Output Guard** → Final safety check

**Live traces:** Access your project at [cloud.langfuse.com](https://cloud.langfuse.com) → Sessions to see all conversation traces.

---

## 🔌 API Endpoints

### Agent / Chat
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Main chat endpoint (text & voice) |
| `POST` | `/api/voice` | Voice input endpoint |
| `GET` | `/api/cart/{session_id}` | Get session cart |
| `POST` | `/api/cart/{session_id}/add` | Direct add-to-cart |
| `GET` | `/api/trace/{session_id}` | Get agent trace |
| `GET` | `/api/search/medications?q=` | Search medications |

### Admin / Inventory
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/medications` | List all medications |
| `PUT` | `/api/admin/inventory/{id}` | Update stock level |
| `POST` | `/api/admin/reindex` | Rebuild vector store |

### Procurement & Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/procurement/orders` | List procurement orders |
| `POST` | `/api/procurement/generate` | Auto-generate PO from forecast |
| `POST` | `/api/procurement/send/{id}` | Send PO to supplier via webhook |
| `POST` | `/api/warehouse/fulfill` | Mock warehouse fulfillment |
| `POST` | `/api/webhooks/receive` | Incoming webhook receiver |

### Forecast & Refills
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/forecast/low-stock` | Predicted stock-outs |
| `GET` | `/api/refill/predictions/{customer_id}` | Customer refill predictions |
| `GET` | `/api/refill/timeline/{customer_id}` | Visual refill timeline |

---

## 🗂️ Data Sources

All data comes from the provided Excel files:
1. **`products-export.xlsx`** — Medicine master data (names, prices, stock, RX flags)
2. **`Consumer Order History 1.xlsx`** — Historical customer orders for predictive intelligence

No hardcoded or external data is used.

---

## 🛡️ Safety Rules

- ✅ Prescription (RX) enforcement from source data
- ✅ No medical advice, diagnoses, or dosage recommendations
- ✅ No antibiotic suggestions
- ✅ Tier-1 alternatives only (same active ingredient)
- ✅ All medications from database only (no hallucination)
- ✅ Input & output guardrails on every turn

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Python FastAPI |
| Database | SQLite (mock backend) |
| Vector Store | ChromaDB + sentence-transformers |
| LLM (Primary) | Groq — Llama 3.3 70B |
| LLM (Fallback) | OpenRouter — Gemma 3 27B, Llama 3.3 70B |
| Voice | Web Speech API (STT/TTS) |
| Observability | Langfuse |

---

## 📁 Project Structure

```
medaura/
├── backend/
│   ├── agents/           # Multi-agent system
│   │   ├── orchestrator.py      # Main pipeline
│   │   ├── ordering_agent.py    # LLM conversational agent
│   │   ├── safety_agent.py      # Input/output guardrails
│   │   ├── forecast_agent.py    # Stock depletion predictions
│   │   └── procurement_agent.py # Auto-procurement + webhooks
│   ├── routes/           # FastAPI endpoints
│   ├── tools/            # Cart, query, trace tools
│   ├── db/               # SQLite database + seed data
│   ├── vector/           # ChromaDB vector search
│   ├── observability/    # Langfuse client
│   ├── services/         # Event logging, user intelligence
│   └── main.py           # Server entry point
├── frontend/
│   └── src/
│       ├── components/   # UI components
│       ├── hooks/        # useSpeech, useRefillPredictions
│       ├── i18n/         # Language context + translations
│       └── pages/        # AdminDashboard
├── data/                 # Excel source files
└── .env                  # API keys & config
```

## License

MIT — Medaura 2026 Demo
