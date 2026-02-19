# Mediloon Agentic Ordering MVP

Voice/text medicine ordering system with agentic AI assistance for India.

## Features

- 🎤 **Voice Input**: Speak to order medicines using Web Speech API
- 🔍 **Fuzzy Search**: Find medications by brand name, generic name, or condition
- 💊 **Indication Lookup**: Ask for "medicine for diabetes" and get relevant options
- ✅ **RX Enforcement**: Binary prescription rules enforced for chronic medications
- 🛒 **Cart Management**: Add, remove, and checkout items
- 📊 **Agent Trace**: See the AI's reasoning in real-time (for judges)

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- OpenRouter API Key

### 1. Setup Environment

```bash
# Clone and navigate
cd /home/prannav/Projects/hackathon

# Create .env file
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

### 2. Start Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server (auto-seeds database)
python main.py
```

Backend runs at http://localhost:8000

### 3. Start Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

Frontend runs at http://localhost:5173

### 4. Configure Firebase Login (Frontend)

1. Copy the Firebase helper env so the login modal can initialize:
	```bash
	cd frontend
	cp .env.example .env
	```
2. Populate the `VITE_FIREBASE_*` keys in `frontend/.env` using the Firebase project settings (API key, auth domain, project ID, app ID, etc.).
3. Keep the service-account JSON outside the repo; store it locally or in a secret manager.

Once the Firebase keys are available, the login modal will sign users in through Firebase Auth before talking to the FastAPI auth routes.

## Demo Flows

### Flow 1: Indication Query
1. Say or type: "I need medicine for diabetes"
2. Select Glycomet or Amaryl from results
3. Confirm you have a prescription
4. Item added to cart

### Flow 2: Brand Search
1. Say or type: "glycomet"
2. Medication found via fuzzy search
3. Confirm prescription
4. Add to cart

### Flow 3: OTC Purchase
1. Say or type: "medicine for cold"
2. Select Crocin or Cetirizine
3. No prescription needed
4. Direct add to cart

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Python FastAPI
- **Database**: SQLite
- **Vector Store**: ChromaDB + sentence-transformers
- **LLM**: OpenRouter (Mistral-7B for NLU, Qwen-72B for planning)
- **Voice**: Web Speech API (STT/TTS)

## API Endpoints

### Agent
- `POST /api/chat` - Main chat endpoint
- `GET /api/cart/{session_id}` - Get cart
- `GET /api/trace/{session_id}` - Get agent trace

### Admin
- `GET /api/admin/medications` - List all medications
- `PUT /api/admin/inventory/{med_id}` - Update stock
- `POST /api/admin/reindex` - Rebuild vector store

## Safety Constraints

- ✅ India-only binary RX model
- ✅ Chronic conditions require prescription (Diabetes, BP, Thyroid)
- ✅ OTC conditions bypass RX (Cold, Fever, Cough)
- ✅ No medical advice or recommendations
- ✅ No antibiotic suggestions
- ✅ Tier-1 alternatives only (same active ingredient)
- ✅ All medications from database only (no hallucination)

## License

MIT - Hackathon Demo
