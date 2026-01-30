-- Mediloon Database Schema
-- SQLite schema for medications, inventory, indications, and orders

-- Medications table
CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generic_name TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    active_ingredient TEXT NOT NULL,
    dosage TEXT NOT NULL,
    form TEXT NOT NULL DEFAULT 'tablet',
    unit_type TEXT NOT NULL DEFAULT 'tablet',
    rx_required BOOLEAN NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indications table (diseases/conditions)
CREATE TABLE IF NOT EXISTS indications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN ('chronic', 'otc'))
);

-- Junction table for medication-indication mapping
CREATE TABLE IF NOT EXISTS medication_indications (
    medication_id INTEGER NOT NULL,
    indication_id INTEGER NOT NULL,
    PRIMARY KEY (medication_id, indication_id),
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
    FOREIGN KEY (indication_id) REFERENCES indications(id) ON DELETE CASCADE
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
    medication_id INTEGER PRIMARY KEY,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);

-- Synonyms table (for fuzzy matching)
CREATE TABLE IF NOT EXISTS synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id INTEGER NOT NULL,
    synonym TEXT NOT NULL,
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    items_json TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cart table (session-based)
CREATE TABLE IF NOT EXISTS cart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    medication_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_medications_generic ON medications(generic_name);
CREATE INDEX IF NOT EXISTS idx_medications_brand ON medications(brand_name);
CREATE INDEX IF NOT EXISTS idx_medications_active ON medications(active_ingredient);
CREATE INDEX IF NOT EXISTS idx_synonyms_medication ON synonyms(medication_id);
CREATE INDEX IF NOT EXISTS idx_cart_session ON cart(session_id);

-- Customers table (for predictive intelligence)
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    preferences_json TEXT,
    notification_enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase history table (for refill predictions)
CREATE TABLE IF NOT EXISTS purchase_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    medication_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    daily_dose INTEGER NOT NULL DEFAULT 1,
    purchase_date TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchase_history_customer ON purchase_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_date ON purchase_history(purchase_date);

-- User Sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);

-- Events table (for activity logging)
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    agent TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    api_endpoint TEXT,
    email TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Procurement Orders table (persisted, not in-memory)
CREATE TABLE IF NOT EXISTS procurement_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    medication_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    supplier_id INTEGER,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'ordered', 'shipped', 'received', 'cancelled')),
    urgency TEXT,
    notes TEXT,
    webhook_payload TEXT,
    webhook_response TEXT,
    stock_before INTEGER,
    stock_after INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (medication_id) REFERENCES medications(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_procurement_status ON procurement_orders(status);
CREATE INDEX IF NOT EXISTS idx_procurement_medication ON procurement_orders(medication_id);

-- Webhook logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK(direction IN ('outgoing', 'incoming')),
    endpoint TEXT NOT NULL,
    method TEXT DEFAULT 'POST',
    payload TEXT,
    response TEXT,
    status_code INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_direction ON webhook_logs(direction);

-- Traces table (for observability UI)
CREATE TABLE IF NOT EXISTS traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT UNIQUE NOT NULL,
    session_id TEXT,
    user_id TEXT,
    name TEXT,
    workflow_type TEXT,
    metadata_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at DESC);

-- Feedback table (for user feedback on agent responses)
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT,
    session_id TEXT,
    rating TEXT NOT NULL CHECK(rating IN ('positive', 'negative')),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trace_id) REFERENCES traces(trace_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_trace ON feedback(trace_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating);
