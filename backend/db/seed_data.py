"""
Seed data for Mediloon MVP
India-relevant medications for chronic and OTC conditions.
"""
import asyncio
import sys
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from db.database import init_db, execute_write, execute_query

# Indications (conditions)
INDICATIONS = [
    # Chronic conditions (require RX)
    {"label": "Type 2 Diabetes", "category": "chronic"},
    {"label": "Hypertension", "category": "chronic"},
    {"label": "Hypothyroidism", "category": "chronic"},
    {"label": "Hyperthyroidism", "category": "chronic"},
    # OTC conditions
    {"label": "Cold", "category": "otc"},
    {"label": "Fever", "category": "otc"},
    {"label": "Cough", "category": "otc"},
    {"label": "Headache", "category": "otc"},
    {"label": "Allergies", "category": "otc"},
    {"label": "Acidity", "category": "otc"},
]

# Medications with Indian brand names
MEDICATIONS = [
    # Diabetes medications (RX required)
    {
        "generic_name": "Metformin",
        "brand_name": "Glycomet",
        "active_ingredient": "Metformin Hydrochloride",
        "dosage": "500mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "First-line diabetes medication",
        "indications": ["Type 2 Diabetes"],
        "synonyms": ["glycomet", "glucophage", "metformin", "sugar tablet", "glcoemet", "glycomat", "glicomet", "glycomet 500"],
        "stock": 120,
    },
    {
        "generic_name": "Metformin",
        "brand_name": "Glycomet SR",
        "active_ingredient": "Metformin Hydrochloride",
        "dosage": "1000mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "Sustained release formulation",
        "indications": ["Type 2 Diabetes"],
        "synonyms": ["glycomet sr", "metformin sr", "glycomet 1000", "glcoemet sr"],
        "stock": 80,
    },
    {
        "generic_name": "Glimepiride",
        "brand_name": "Amaryl",
        "active_ingredient": "Glimepiride",
        "dosage": "2mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "Sulfonylurea for diabetes",
        "indications": ["Type 2 Diabetes"],
        "synonyms": ["amaryl", "glimepiride", "glimstar", "amaril", "glimiperide", "glimaril"],
        "stock": 100,
    },
    {
        "generic_name": "Sitagliptin",
        "brand_name": "Januvia",
        "active_ingredient": "Sitagliptin Phosphate",
        "dosage": "100mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "DPP-4 inhibitor",
        "indications": ["Type 2 Diabetes"],
        "synonyms": ["januvia", "sitagliptin", "zita"],
        "stock": 50,
    },
    # Hypertension medications (RX required)
    {
        "generic_name": "Amlodipine",
        "brand_name": "Amlong",
        "active_ingredient": "Amlodipine Besylate",
        "dosage": "5mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "Calcium channel blocker for BP",
        "indications": ["Hypertension"],
        "synonyms": ["amlong", "amlodipine", "amlokind", "stamlo"],
        "stock": 150,
    },
    {
        "generic_name": "Telmisartan",
        "brand_name": "Telmikind",
        "active_ingredient": "Telmisartan",
        "dosage": "40mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "ARB for hypertension",
        "indications": ["Hypertension"],
        "synonyms": ["telmikind", "telmisartan", "telma", "telvas", "telmisarton", "telmasartan", "telmi"],
        "stock": 90,
    },
    {
        "generic_name": "Losartan",
        "brand_name": "Losar",
        "active_ingredient": "Losartan Potassium",
        "dosage": "50mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "ARB for blood pressure",
        "indications": ["Hypertension"],
        "synonyms": ["losar", "losartan", "losacar", "repace"],
        "stock": 75,
    },
    # Thyroid medications (RX required)
    {
        "generic_name": "Levothyroxine",
        "brand_name": "Thyronorm",
        "active_ingredient": "Levothyroxine Sodium",
        "dosage": "50mcg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "Thyroid hormone replacement",
        "indications": ["Hypothyroidism"],
        "synonyms": ["thyronorm", "levothyroxine", "eltroxin", "thyrox", "eltroxine", "eltroxen", "altroxin", "thyronorm 50"],
        "stock": 200,
    },
    {
        "generic_name": "Levothyroxine",
        "brand_name": "Thyronorm",
        "active_ingredient": "Levothyroxine Sodium",
        "dosage": "100mcg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "Higher dose thyroid replacement",
        "indications": ["Hypothyroidism"],
        "synonyms": ["thyronorm 100", "thyrox 100"],
        "stock": 150,
    },
    {
        "generic_name": "Carbimazole",
        "brand_name": "Neo-Mercazole",
        "active_ingredient": "Carbimazole",
        "dosage": "5mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "Antithyroid medication",
        "indications": ["Hyperthyroidism"],
        "synonyms": ["neomercazole", "carbimazole", "thyrocab"],
        "stock": 60,
    },
    # OTC - Cold & Fever
    {
        "generic_name": "Paracetamol",
        "brand_name": "Crocin",
        "active_ingredient": "Paracetamol",
        "dosage": "500mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "Fever and pain relief",
        "indications": ["Fever", "Headache", "Cold"],
        "synonyms": ["crocin", "paracetamol", "dolo", "calpol", "tylenol", "crosine", "crosin", "paracitamol", "parasitamol"],
        "stock": 500,
    },
    {
        "generic_name": "Paracetamol",
        "brand_name": "Dolo 650",
        "active_ingredient": "Paracetamol",
        "dosage": "650mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "Higher strength fever relief",
        "indications": ["Fever", "Headache"],
        "synonyms": ["dolo 650", "dolo", "paracetamol 650"],
        "stock": 400,
    },
    {
        "generic_name": "Ibuprofen",
        "brand_name": "Brufen",
        "active_ingredient": "Ibuprofen",
        "dosage": "400mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "NSAID for pain and inflammation",
        "indications": ["Fever", "Headache"],
        "synonyms": ["brufen", "ibuprofen", "advil", "combiflam"],
        "stock": 300,
    },
    # OTC - Cough
    {
        "generic_name": "Dextromethorphan",
        "brand_name": "Benadryl DR",
        "active_ingredient": "Dextromethorphan Hydrobromide",
        "dosage": "10mg/5ml",
        "form": "syrup",
        "unit_type": "ml",
        "rx_required": False,
        "notes": "Cough suppressant",
        "indications": ["Cough", "Cold"],
        "synonyms": ["benadryl", "benadryl dr", "cough syrup"],
        "stock": 100,
    },
    {
        "generic_name": "Guaifenesin",
        "brand_name": "Ascoril D",
        "active_ingredient": "Guaifenesin",
        "dosage": "100mg/5ml",
        "form": "syrup",
        "unit_type": "ml",
        "rx_required": False,
        "notes": "Expectorant for wet cough",
        "indications": ["Cough"],
        "synonyms": ["ascoril", "ascoril d", "expectorant"],
        "stock": 80,
    },
    # OTC - Allergies
    {
        "generic_name": "Cetirizine",
        "brand_name": "Alerid",
        "active_ingredient": "Cetirizine Dihydrochloride",
        "dosage": "10mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "Antihistamine for allergies",
        "indications": ["Allergies", "Cold"],
        "synonyms": ["alerid", "cetirizine", "zyrtec", "cetzine"],
        "stock": 250,
    },
    {
        "generic_name": "Levocetirizine",
        "brand_name": "Xyzal",
        "active_ingredient": "Levocetirizine Dihydrochloride",
        "dosage": "5mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "Non-drowsy antihistamine",
        "indications": ["Allergies"],
        "synonyms": ["xyzal", "levocetirizine", "levocet"],
        "stock": 180,
    },
    # OTC - Acidity
    {
        "generic_name": "Omeprazole",
        "brand_name": "Omez",
        "active_ingredient": "Omeprazole",
        "dosage": "20mg",
        "form": "capsule",
        "unit_type": "capsule",
        "rx_required": False,
        "notes": "Proton pump inhibitor for acidity",
        "indications": ["Acidity"],
        "synonyms": ["omez", "omeprazole", "prilosec"],
        "stock": 200,
    },
    {
        "generic_name": "Pantoprazole",
        "brand_name": "Pan D",
        "active_ingredient": "Pantoprazole Sodium",
        "dosage": "40mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "PPI for gastric issues",
        "indications": ["Acidity"],
        "synonyms": ["pan d", "pantoprazole", "pantocid"],
        "stock": 150,
    },
    {
        "generic_name": "Ranitidine",
        "brand_name": "Zinetac",
        "active_ingredient": "Ranitidine Hydrochloride",
        "dosage": "150mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "H2 blocker for acidity",
        "indications": ["Acidity"],
        "synonyms": ["zinetac", "ranitidine", "rantac", "aciloc"],
        "stock": 120,
    },
    # Vitamin supplements (OTC)
    {
        "generic_name": "Vitamin C",
        "brand_name": "Limcee",
        "active_ingredient": "Ascorbic Acid",
        "dosage": "500mg",
        "form": "chewable tablet",
        "unit_type": "tablet",
        "rx_required": False,
        "notes": "Vitamin C supplement",
        "indications": ["Cold"],
        "synonyms": ["limcee", "vitamin c", "celin", "ascorbic acid"],
        "stock": 300,
    },
    # OOS Demo medication - same active ingredient as Glycomet
    {
        "generic_name": "Metformin",
        "brand_name": "Glucophage XR",
        "active_ingredient": "Metformin Hydrochloride",
        "dosage": "500mg",
        "form": "tablet",
        "unit_type": "tablet",
        "rx_required": True,
        "notes": "OUT OF STOCK - for demo purposes. Alternative: Glycomet",
        "indications": ["Type 2 Diabetes"],
        "synonyms": ["glucophage", "glucophage xr", "glucofage"],
        "stock": 0,  # Out of stock for demo
    },
]


async def seed_database():
    """Seed the database with initial data."""
    print("Initializing database...")
    await init_db()
    
    # Check if already seeded
    existing = await execute_query("SELECT COUNT(*) as count FROM medications")
    if existing and existing[0]['count'] > 0:
        print("Database already seeded. Skipping...")
        return
    
    print("Seeding indications...")
    indication_map = {}
    for ind in INDICATIONS:
        ind_id = await execute_write(
            "INSERT INTO indications (label, category) VALUES (?, ?)",
            (ind["label"], ind["category"])
        )
        indication_map[ind["label"]] = ind_id
    
    print("Seeding medications...")
    for med in MEDICATIONS:
        # Insert medication
        med_id = await execute_write(
            """INSERT INTO medications 
            (generic_name, brand_name, active_ingredient, dosage, form, unit_type, rx_required, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                med["generic_name"],
                med["brand_name"],
                med["active_ingredient"],
                med["dosage"],
                med["form"],
                med["unit_type"],
                med["rx_required"],
                med.get("notes", "")
            )
        )
        
        # Insert inventory
        await execute_write(
            "INSERT INTO inventory (medication_id, stock_quantity) VALUES (?, ?)",
            (med_id, med.get("stock", 100))
        )
        
        # Insert synonyms
        for syn in med.get("synonyms", []):
            await execute_write(
                "INSERT INTO synonyms (medication_id, synonym) VALUES (?, ?)",
                (med_id, syn.lower())
            )
        
        # Insert indication mappings
        for ind_label in med.get("indications", []):
            if ind_label in indication_map:
                await execute_write(
                    "INSERT INTO medication_indications (medication_id, indication_id) VALUES (?, ?)",
                    (med_id, indication_map[ind_label])
                )
    
    print(f"✅ Seeded {len(MEDICATIONS)} medications with {len(INDICATIONS)} indications")
    
    # Seed mock customers and purchase history for predictive intelligence
    print("Seeding customers and purchase history...")
    
    # Mock customers (including admin)
    customers = [
        {"name": "Admin User", "phone": "+91-9999999999", "email": "admin@mediloon.com", "role": "admin"},
        {"name": "Rajesh Kumar", "phone": "+91-9876543210", "email": "rajesh@example.com", "role": "user"},
        {"name": "Priya Sharma", "phone": "+91-9876543211", "email": "priya@example.com", "role": "user"},
        {"name": "Amit Patel", "phone": "+91-9876543212", "email": "amit@example.com", "role": "user"},
        {"name": "Sunita Devi", "phone": "+91-9876543213", "email": "sunita@example.com", "role": "user"},
    ]
    
    customer_ids = []
    for cust in customers:
        cust_id = await execute_write(
            "INSERT INTO customers (name, phone, email, role) VALUES (?, ?, ?, ?)",
            (cust["name"], cust["phone"], cust["email"], cust.get("role", "user"))
        )
        customer_ids.append(cust_id)
    
    # Get medication IDs for chronic meds
    glycomet = await execute_query("SELECT id FROM medications WHERE brand_name = 'Glycomet'")
    telmikind = await execute_query("SELECT id FROM medications WHERE brand_name = 'Telmikind'")
    thyronorm = await execute_query("SELECT id FROM medications WHERE brand_name = 'Thyronorm'")
    
    # Mock purchase history (with dates that create realistic depletion scenarios)
    from datetime import datetime, timedelta
    today = datetime.now()
    
    purchases = [
        # Rajesh - diabetes, running out in 3 days
        {"customer_id": customer_ids[0], "medication_id": glycomet[0]['id'] if glycomet else 1, 
         "quantity": 30, "daily_dose": 2, "days_ago": 13},  # 30/2 = 15 days supply, 13 ago = 2 left
        
        # Priya - hypertension, running out in 5 days  
        {"customer_id": customer_ids[1], "medication_id": telmikind[0]['id'] if telmikind else 4,
         "quantity": 30, "daily_dose": 1, "days_ago": 25},  # 30/1 = 30 days, 25 ago = 5 left
        
        # Amit - thyroid, running out in 10 days
        {"customer_id": customer_ids[2], "medication_id": thyronorm[0]['id'] if thyronorm else 6,
         "quantity": 60, "daily_dose": 1, "days_ago": 50},  # 60/1 = 60 days, 50 ago = 10 left
        
        # Sunita - diabetes, well stocked (20 days left)
        {"customer_id": customer_ids[3], "medication_id": glycomet[0]['id'] if glycomet else 1,
         "quantity": 60, "daily_dose": 2, "days_ago": 10},  # 60/2 = 30 days, 10 ago = 20 left
    ]
    
    for purchase in purchases:
        purchase_date = (today - timedelta(days=purchase["days_ago"])).strftime("%Y-%m-%d")
        await execute_write(
            """INSERT INTO purchase_history 
            (customer_id, medication_id, quantity, daily_dose, purchase_date)
            VALUES (?, ?, ?, ?, ?)""",
            (purchase["customer_id"], purchase["medication_id"], 
             purchase["quantity"], purchase["daily_dose"], purchase_date)
        )
    
    print(f"✅ Seeded {len(customers)} customers with {len(purchases)} purchase records")
    
    # Seed suppliers
    print("Seeding suppliers...")
    suppliers = [
        {
            "name": "PharmaDist India Pvt Ltd",
            "code": "PDI-001",
            "api_endpoint": "http://localhost:8000/api/webhooks/receive",
            "email": "orders@pharmadist.in",
            "phone": "+91-1800-123-4567"
        },
        {
            "name": "MedSupply Global",
            "code": "MSG-002",
            "api_endpoint": "http://localhost:8000/api/webhooks/receive",
            "email": "procurement@medsupply.com",
            "phone": "+91-1800-987-6543"
        },
        {
            "name": "HealthWholesale India",
            "code": "HWS-003",
            "api_endpoint": "http://localhost:8000/api/webhooks/receive",
            "email": "orders@healthwholesale.in",
            "phone": "+91-1800-555-0123"
        },
    ]
    
    for supplier in suppliers:
        await execute_write(
            """INSERT OR IGNORE INTO suppliers (name, code, api_endpoint, email, phone)
               VALUES (?, ?, ?, ?, ?)""",
            (supplier["name"], supplier["code"], supplier["api_endpoint"], 
             supplier["email"], supplier["phone"])
        )
    
    print(f"✅ Seeded {len(suppliers)} suppliers")


if __name__ == "__main__":
    asyncio.run(seed_database())
