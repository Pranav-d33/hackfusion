PRAGMA foreign_keys = ON;

-- ============================================================
-- MEDILOON V2 SCHEMA (Excel-first redesign)
-- Covers both non-translated files:
--   1) Consumer Order History 1.xlsx
--   2) products-export.xlsx
--
-- Goal: store EVERY part of workbook content.
-- - Raw layer: workbook/sheet/row/cell-level ingestion (lossless capture)
-- - Curated layer: typed tables for direct application use
-- ============================================================

-- ------------------------------------------------------------
-- 1) RAW INGESTION LAYER (lossless)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	run_uuid TEXT NOT NULL UNIQUE,
	source_system TEXT,
	notes TEXT,
	started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	finished_at TIMESTAMP,
	status TEXT NOT NULL DEFAULT 'running'
		CHECK(status IN ('running', 'success', 'failed', 'partial'))
);

CREATE TABLE IF NOT EXISTS source_workbooks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	import_run_id INTEGER NOT NULL,
	file_name TEXT NOT NULL,
	file_path TEXT,
	file_size_bytes INTEGER,
	file_hash_sha256 TEXT,
	workbook_title TEXT,
	source_language TEXT,
	row_count_estimate INTEGER,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(import_run_id, file_name),
	FOREIGN KEY (import_run_id) REFERENCES import_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workbook_sheets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	workbook_id INTEGER NOT NULL,
	sheet_name TEXT NOT NULL,
	sheet_index INTEGER NOT NULL,
	max_row INTEGER,
	max_column INTEGER,
	header_row_index INTEGER,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(workbook_id, sheet_name),
	FOREIGN KEY (workbook_id) REFERENCES source_workbooks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sheet_rows (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sheet_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	row_kind TEXT NOT NULL DEFAULT 'data'
		CHECK(row_kind IN ('title', 'subtitle', 'header', 'data', 'blank', 'footer', 'unknown')),
	raw_values_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(sheet_id, row_index),
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sheet_cells (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sheet_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	col_index INTEGER NOT NULL,
	col_label TEXT,
	header_name TEXT,
	value_type TEXT
		CHECK(value_type IN ('string', 'number', 'integer', 'boolean', 'date', 'datetime', 'empty', 'error', 'formula', 'unknown')),
	value_text TEXT,
	value_number REAL,
	value_boolean BOOLEAN,
	value_datetime TEXT,
	formula_text TEXT,
	number_format TEXT,
	is_merged_cell BOOLEAN DEFAULT 0,
	metadata_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(sheet_id, row_index, col_index),
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_workbooks_file_name ON source_workbooks(file_name);
CREATE INDEX IF NOT EXISTS idx_workbook_sheets_workbook_id ON workbook_sheets(workbook_id);
CREATE INDEX IF NOT EXISTS idx_sheet_rows_sheet_id_row ON sheet_rows(sheet_id, row_index);
CREATE INDEX IF NOT EXISTS idx_sheet_cells_sheet_row_col ON sheet_cells(sheet_id, row_index, col_index);
CREATE INDEX IF NOT EXISTS idx_sheet_cells_header_name ON sheet_cells(header_name);

-- ------------------------------------------------------------
-- 2) CURATED TABLES FOR products-export.xlsx (sheet: Products)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS products_export_records (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	workbook_id INTEGER NOT NULL,
	sheet_id INTEGER NOT NULL,
	source_row_index INTEGER NOT NULL,
	source_language TEXT NOT NULL DEFAULT 'de',

	product_id INTEGER NOT NULL,
	product_name TEXT NOT NULL,
	product_name_i18n_key TEXT,
	pzn INTEGER,
	price_rec_eur NUMERIC(10,2),
	package_size TEXT,
	descriptions TEXT,
	descriptions_i18n_key TEXT,
	translation_status TEXT NOT NULL DEFAULT 'pending'
		CHECK(translation_status IN ('pending', 'translated', 'verified', 'failed', 'not_required')),

	raw_record_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE(workbook_id, sheet_id, source_row_index),
	UNIQUE(product_id),
	FOREIGN KEY (workbook_id) REFERENCES source_workbooks(id) ON DELETE CASCADE,
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_products_export_name ON products_export_records(product_name);
CREATE INDEX IF NOT EXISTS idx_products_export_pzn ON products_export_records(pzn);

-- ------------------------------------------------------------
-- 3) CURATED TABLES FOR Consumer Order History 1.xlsx
--    (sheet: Sheet1)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consumer_order_history_records (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	workbook_id INTEGER NOT NULL,
	sheet_id INTEGER NOT NULL,
	source_row_index INTEGER NOT NULL,
	source_language TEXT NOT NULL DEFAULT 'de',

	patient_id TEXT NOT NULL,
	patient_age INTEGER,
	patient_gender TEXT,
	patient_gender_norm TEXT,
	purchase_date TEXT,
	product_name TEXT NOT NULL,
	product_name_i18n_key TEXT,
	quantity INTEGER,
	total_price_eur NUMERIC(10,2),
	dosage_frequency TEXT,
	dosage_frequency_norm TEXT,
	prescription_required TEXT,
	prescription_required_bool BOOLEAN,
	translation_status TEXT NOT NULL DEFAULT 'pending'
		CHECK(translation_status IN ('pending', 'translated', 'verified', 'failed', 'not_required')),

	raw_record_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE(workbook_id, sheet_id, source_row_index),
	FOREIGN KEY (workbook_id) REFERENCES source_workbooks(id) ON DELETE CASCADE,
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coh_patient_id ON consumer_order_history_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_coh_purchase_date ON consumer_order_history_records(purchase_date);
CREATE INDEX IF NOT EXISTS idx_coh_product_name ON consumer_order_history_records(product_name);

-- Title/subtitle/header rows from Consumer Order History are stored
-- explicitly so no semantic information is lost.
CREATE TABLE IF NOT EXISTS consumer_order_history_sheet_metadata (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	workbook_id INTEGER NOT NULL,
	sheet_id INTEGER NOT NULL,
	title_text TEXT,
	subtitle_text TEXT,
	header_row_index INTEGER,
	header_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(workbook_id, sheet_id),
	FOREIGN KEY (workbook_id) REFERENCES source_workbooks(id) ON DELETE CASCADE,
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4) DOMAIN TABLES (inventory + customer redesign)
--    populated from curated imports and app actions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	external_patient_id TEXT UNIQUE,
	name TEXT,
	email TEXT,
	age INTEGER,
	gender TEXT,
	phone TEXT,
	address TEXT,
	city TEXT,
	state TEXT,
	postal_code TEXT,
	country TEXT DEFAULT 'Germany',
	password_hash TEXT,
	notification_enabled BOOLEAN DEFAULT 1,
	preferences_json TEXT,
	profile_completed BOOLEAN DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_catalog (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	external_product_id INTEGER UNIQUE,
	product_name TEXT NOT NULL,
	product_name_i18n_key TEXT,
	pzn INTEGER UNIQUE,
	package_size TEXT,
	description TEXT,
	description_i18n_key TEXT,
	base_price_eur NUMERIC(10,2),
	default_language TEXT NOT NULL DEFAULT 'de',
	translation_quality_score REAL,
	source_record_id INTEGER,
	rx_required BOOLEAN DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP,
	FOREIGN KEY (source_record_id) REFERENCES products_export_records(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	product_catalog_id INTEGER NOT NULL UNIQUE,
	stock_quantity INTEGER NOT NULL DEFAULT 0,
	reorder_threshold INTEGER NOT NULL DEFAULT 0,
	reorder_quantity INTEGER NOT NULL DEFAULT 0,
	last_restocked_at TIMESTAMP,
	last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (product_catalog_id) REFERENCES product_catalog(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_orders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	customer_id INTEGER,
	external_source_row INTEGER,
	source_record_id INTEGER,
	purchase_date TEXT,
	total_price_eur NUMERIC(10,2),
	dosage_frequency TEXT,
	dosage_frequency_norm TEXT,
	prescription_required BOOLEAN,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
	FOREIGN KEY (source_record_id) REFERENCES consumer_order_history_records(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_order_items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id INTEGER NOT NULL,
	product_catalog_id INTEGER,
	raw_product_name TEXT NOT NULL,
	quantity INTEGER NOT NULL DEFAULT 1,
	line_total_eur NUMERIC(10,2),
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE CASCADE,
	FOREIGN KEY (product_catalog_id) REFERENCES product_catalog(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_external_patient_id ON customers(external_patient_id);
CREATE INDEX IF NOT EXISTS idx_product_catalog_name ON product_catalog(product_name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_stock ON inventory_items(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_customer_orders_customer_date ON customer_orders(customer_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_customer_order_items_order ON customer_order_items(order_id);

-- ------------------------------------------------------------
-- 5) LANGUAGE NORMALIZATION LAYER
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS languages (
	code TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	native_name TEXT,
	is_active BOOLEAN NOT NULL DEFAULT 1,
	is_default BOOLEAN NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS localized_strings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	namespace TEXT NOT NULL,
	string_key TEXT NOT NULL,
	source_language TEXT NOT NULL,
	source_text TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP,
	UNIQUE(namespace, string_key)
);

CREATE TABLE IF NOT EXISTS localized_string_translations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	localized_string_id INTEGER NOT NULL,
	language_code TEXT NOT NULL,
	translated_text TEXT NOT NULL,
	translation_status TEXT NOT NULL DEFAULT 'translated'
		CHECK(translation_status IN ('pending', 'translated', 'verified', 'failed', 'deprecated')),
	confidence REAL,
	provider TEXT,
	provider_metadata_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP,
	UNIQUE(localized_string_id, language_code),
	FOREIGN KEY (localized_string_id) REFERENCES localized_strings(id) ON DELETE CASCADE,
	FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS language_term_mappings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	domain TEXT NOT NULL
		CHECK(domain IN ('product_name', 'dosage_frequency', 'prescription_flag', 'generic_term', 'other')),
	source_language TEXT NOT NULL DEFAULT 'de',
	source_text TEXT NOT NULL,
	target_language TEXT NOT NULL DEFAULT 'en',
	target_text TEXT NOT NULL,
	normalized_key TEXT,
	confidence REAL,
	is_active BOOLEAN NOT NULL DEFAULT 1,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP,
	UNIQUE(domain, source_language, source_text, target_language)
);

CREATE TABLE IF NOT EXISTS translation_jobs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	import_run_id INTEGER,
	workbook_id INTEGER,
	sheet_id INTEGER,
	table_name TEXT NOT NULL,
	column_name TEXT NOT NULL,
	source_language TEXT NOT NULL DEFAULT 'de',
	target_language TEXT NOT NULL DEFAULT 'en',
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK(status IN ('pending', 'running', 'success', 'failed', 'partial')),
	total_items INTEGER DEFAULT 0,
	processed_items INTEGER DEFAULT 0,
	failed_items INTEGER DEFAULT 0,
	error_message TEXT,
	started_at TIMESTAMP,
	finished_at TIMESTAMP,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (import_run_id) REFERENCES import_runs(id) ON DELETE SET NULL,
	FOREIGN KEY (workbook_id) REFERENCES source_workbooks(id) ON DELETE SET NULL,
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_languages_active ON languages(is_active);
CREATE INDEX IF NOT EXISTS idx_localized_strings_lookup ON localized_strings(namespace, string_key);
CREATE INDEX IF NOT EXISTS idx_localized_strings_source ON localized_strings(source_language);
CREATE INDEX IF NOT EXISTS idx_localized_translations_lang ON localized_string_translations(language_code);
CREATE INDEX IF NOT EXISTS idx_language_term_mappings_lookup ON language_term_mappings(domain, source_language, source_text);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs(status);

-- ------------------------------------------------------------
-- 6) LIGHTWEIGHT AUDIT
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ingestion_issues (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	import_run_id INTEGER NOT NULL,
	workbook_id INTEGER,
	sheet_id INTEGER,
	row_index INTEGER,
	col_index INTEGER,
	severity TEXT NOT NULL DEFAULT 'warning'
		CHECK(severity IN ('info', 'warning', 'error')),
	issue_code TEXT,
	issue_message TEXT NOT NULL,
	context_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (import_run_id) REFERENCES import_runs(id) ON DELETE CASCADE,
	FOREIGN KEY (workbook_id) REFERENCES source_workbooks(id) ON DELETE CASCADE,
	FOREIGN KEY (sheet_id) REFERENCES workbook_sheets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ingestion_issues_run ON ingestion_issues(import_run_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_issues_location ON ingestion_issues(workbook_id, sheet_id, row_index, col_index);

-- ------------------------------------------------------------
-- 7) APPLICATION RUNTIME TABLES
--    (cart, orders, events, traces, sessions, procurement, etc.)
-- ------------------------------------------------------------

-- Session-based shopping cart
CREATE TABLE IF NOT EXISTS cart (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	product_catalog_id INTEGER NOT NULL,
	quantity INTEGER NOT NULL DEFAULT 1,
	dose TEXT,
	added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (product_catalog_id) REFERENCES product_catalog(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cart_session ON cart(session_id);

-- Confirmed orders (from checkout)
CREATE TABLE IF NOT EXISTS orders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	customer_id INTEGER,
	items_json TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'confirmed'
		CHECK(status IN ('confirmed', 'processing', 'fulfilled', 'cancelled')),
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- Suppliers for procurement
CREATE TABLE IF NOT EXISTS suppliers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	code TEXT UNIQUE,
	email TEXT,
	phone TEXT,
	api_endpoint TEXT,
	is_active BOOLEAN NOT NULL DEFAULT 1,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Procurement orders
CREATE TABLE IF NOT EXISTS procurement_orders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id TEXT NOT NULL UNIQUE,
	product_catalog_id INTEGER NOT NULL,
	quantity INTEGER NOT NULL,
	supplier_id INTEGER,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK(status IN ('pending', 'ordered', 'shipped', 'received', 'cancelled')),
	urgency TEXT,
	notes TEXT,
	stock_before INTEGER,
	stock_after INTEGER,
	webhook_payload TEXT,
	webhook_response TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP,
	FOREIGN KEY (product_catalog_id) REFERENCES product_catalog(id) ON DELETE CASCADE,
	FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_procurement_orders_status ON procurement_orders(status);
CREATE INDEX IF NOT EXISTS idx_procurement_orders_product ON procurement_orders(product_catalog_id);

-- Webhook logs
CREATE TABLE IF NOT EXISTS webhook_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
	endpoint TEXT,
	method TEXT DEFAULT 'POST',
	payload TEXT,
	response TEXT,
	status_code INTEGER,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agent activity events
CREATE TABLE IF NOT EXISTS events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_type TEXT NOT NULL,
	agent TEXT,
	message TEXT,
	metadata_json TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- Traces for observability
CREATE TABLE IF NOT EXISTS traces (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	trace_id TEXT UNIQUE,
	session_id TEXT,
	name TEXT,
	input_text TEXT,
	output_text TEXT,
	metadata_json TEXT,
	latency_ms INTEGER,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);

-- User feedback on traces
CREATE TABLE IF NOT EXISTS feedback (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	trace_id TEXT,
	session_id TEXT,
	rating TEXT CHECK(rating IN ('positive', 'negative')),
	comment TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User sessions for auth
CREATE TABLE IF NOT EXISTS user_sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	session_token TEXT NOT NULL UNIQUE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	expires_at TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
