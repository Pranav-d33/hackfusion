"""
Seed Indian Medicines into Mediloon DB
Inserts popular Indian OTC and common medicines directly into
product_catalog and inventory_items, bypassing the Excel pipeline.
Run once: python backend/db/seed_indian_medicines.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.database import init_db, execute_query, execute_write

# ── Indian Medicine Catalog ─────────────────────────────────
# Prices in EUR (approx ₹90 = €1)
INDIAN_MEDICINES = [
    # Pain / Fever
    {
        "name": "Dolo 650 Tablets",
        "desc": "Paracetamol 650mg — for fever, headache, and body pain. India's most trusted paracetamol brand.",
        "price": 0.35,
        "package": "15 tablets",
        "rx": False,
    },
    {
        "name": "Crocin 500 Tablets",
        "desc": "Paracetamol 500mg — effective pain and fever relief for adults and children above 12 years.",
        "price": 0.30,
        "package": "15 tablets",
        "rx": False,
    },
    {
        "name": "Combiflam Tablets",
        "desc": "Ibuprofen 400mg + Paracetamol 325mg — dual action pain reliever for headache, toothache, and joint pain.",
        "price": 0.50,
        "package": "20 tablets",
        "rx": False,
    },
    {
        "name": "Saridon Tablets",
        "desc": "Propyphenazone + Paracetamol + Caffeine — fast-acting headache and migraine relief.",
        "price": 0.25,
        "package": "10 tablets",
        "rx": False,
    },
    {
        "name": "Disprin Tablets",
        "desc": "Aspirin 350mg — for quick headache, body aches, and mild fever relief. Effervescent formula.",
        "price": 0.15,
        "package": "10 tablets",
        "rx": False,
    },

    # Cold / Cough
    {
        "name": "Sinarest New Tablets",
        "desc": "Paracetamol + Phenylephrine + Chlorpheniramine + Caffeine — complete cold and flu relief.",
        "price": 0.40,
        "package": "10 tablets",
        "rx": False,
    },
    {
        "name": "Vicks Action 500 Advanced",
        "desc": "Paracetamol + Phenylephrine + Caffeine + Cetirizine — fast relief from cold, headache, and blocked nose.",
        "price": 0.55,
        "package": "10 tablets",
        "rx": False,
    },
    {
        "name": "Benadryl Cough Syrup",
        "desc": "Diphenhydramine cough suppressant — effective dry cough and allergy relief syrup.",
        "price": 1.20,
        "package": "100 ml",
        "rx": False,
    },
    {
        "name": "Koflet Syrup (Himalaya)",
        "desc": "Ayurvedic herbal cough syrup — natural remedy for productive and dry cough. Sugar-free.",
        "price": 1.00,
        "package": "100 ml",
        "rx": False,
    },
    {
        "name": "Otrivin Nasal Drops",
        "desc": "Xylometazoline 0.1% — fast-acting nasal decongestant for blocked nose and sinusitis.",
        "price": 0.90,
        "package": "10 ml",
        "rx": False,
    },

    # Digestive
    {
        "name": "Gelusil MPS Tablets",
        "desc": "Dried aluminium hydroxide + Magnesium hydroxide + Simethicone — antacid for acidity, gas, and heartburn.",
        "price": 0.55,
        "package": "15 tablets",
        "rx": False,
    },
    {
        "name": "Eno Fruit Salt (Regular)",
        "desc": "Sodium bicarbonate + Citric acid — instant relief from acidity and indigestion. Fizzy antacid.",
        "price": 0.10,
        "package": "5 g sachet",
        "rx": False,
    },
    {
        "name": "Hajmola Tablets",
        "desc": "Ayurvedic digestive tablets — improves appetite and provides relief from indigestion and flatulence.",
        "price": 0.55,
        "package": "120 tablets",
        "rx": False,
    },
    {
        "name": "Pudin Hara Pearls",
        "desc": "Mentha oil capsules — instant relief from gas, acidity, and indigestion. Natural peppermint formula.",
        "price": 0.35,
        "package": "10 capsules",
        "rx": False,
    },
    {
        "name": "Digene Gel (Mint)",
        "desc": "Aluminium hydroxide + Magnesium hydroxide + Simethicone — antacid gel for quick heartburn and acidity relief.",
        "price": 1.10,
        "package": "200 ml",
        "rx": False,
    },

    # Allergy
    {
        "name": "Cetzine Tablets",
        "desc": "Cetirizine 10mg — non-drowsy antihistamine for allergic rhinitis, skin rash, and itching.",
        "price": 0.30,
        "package": "10 tablets",
        "rx": False,
    },
    {
        "name": "Allegra 120mg Tablets",
        "desc": "Fexofenadine 120mg — non-sedating antihistamine for seasonal allergies, sneezing, and runny nose.",
        "price": 1.55,
        "package": "10 tablets",
        "rx": False,
    },
    {
        "name": "Montair LC Tablets",
        "desc": "Montelukast 10mg + Levocetirizine 5mg — for allergic rhinitis, asthma prevention, and chronic urticaria.",
        "price": 1.80,
        "package": "10 tablets",
        "rx": True,
    },

    # Vitamins & Supplements
    {
        "name": "Supradyn Daily Multivitamin",
        "desc": "Complete multivitamin with minerals — 12 vitamins and 6 minerals for daily energy and immunity.",
        "price": 1.70,
        "package": "15 tablets",
        "rx": False,
    },
    {
        "name": "Becosules Capsules",
        "desc": "Vitamin B Complex + Vitamin C — essential B-vitamins for mouth ulcers, weakness, and nerve health.",
        "price": 0.55,
        "package": "20 capsules",
        "rx": False,
    },
    {
        "name": "Revital H Capsules",
        "desc": "Ginseng + multivitamins + minerals — daily health supplement for energy, stamina, and immunity.",
        "price": 2.20,
        "package": "30 capsules",
        "rx": False,
    },
    {
        "name": "Zincovit Tablets",
        "desc": "Zinc + multivitamin — immune booster with Vitamin C, Vitamin A, and essential minerals.",
        "price": 1.30,
        "package": "15 tablets",
        "rx": False,
    },
    {
        "name": "Shelcal 500 Tablets",
        "desc": "Calcium 500mg + Vitamin D3 — for bone health, osteoporosis prevention, and calcium deficiency.",
        "price": 1.10,
        "package": "15 tablets",
        "rx": False,
    },

    # Antiseptic / Topical
    {
        "name": "Betadine Solution",
        "desc": "Povidone-iodine 5% — antiseptic solution for wound cleansing, minor cuts, and infection prevention.",
        "price": 1.00,
        "package": "50 ml",
        "rx": False,
    },
    {
        "name": "Burnol Cream",
        "desc": "Aminacrine + Cetrimide — antiseptic cream for burns, cuts, and minor skin wounds.",
        "price": 0.50,
        "package": "20 g",
        "rx": False,
    },
    {
        "name": "Soframycin Skin Cream",
        "desc": "Framycetin sulphate — antibiotic cream for bacterial skin infections, wounds, and burns.",
        "price": 0.80,
        "package": "30 g",
        "rx": False,
    },

    # Ayurvedic
    {
        "name": "Dabur Chyawanprash",
        "desc": "Traditional Ayurvedic health supplement — boosts immunity with Amla and 40+ Ayurvedic herbs.",
        "price": 3.30,
        "package": "500 g",
        "rx": False,
    },
    {
        "name": "Himalaya Liv.52 Tablets",
        "desc": "Herbal liver protectant — supports liver function, detoxification, and appetite improvement.",
        "price": 1.00,
        "package": "100 tablets",
        "rx": False,
    },
    {
        "name": "Himalaya Septilin Tablets",
        "desc": "Ayurvedic immune booster — for recurrent infections, tonsillitis, and upper respiratory tract infections.",
        "price": 1.30,
        "package": "60 tablets",
        "rx": False,
    },

    # Diabetes / BP (common Rx)
    {
        "name": "Glycomet 500 SR Tablets",
        "desc": "Metformin 500mg sustained release — oral anti-diabetic for Type 2 diabetes management.",
        "price": 0.70,
        "package": "20 tablets",
        "rx": True,
    },
    {
        "name": "Amlodipine 5mg Tablets",
        "desc": "Amlodipine besylate 5mg — calcium channel blocker for high blood pressure and angina.",
        "price": 0.35,
        "package": "14 tablets",
        "rx": True,
    },
]


async def seed_indian_medicines():
    """Insert Indian medicines into product_catalog + inventory_items."""
    await init_db()

    # Find the max external_product_id to avoid conflicts
    rows = await execute_query(
        "SELECT MAX(external_product_id) as max_id FROM product_catalog"
    )
    next_ext_id = (rows[0]["max_id"] or 10000) + 1000  # start well above existing range

    # Find the max PZN to generate unique PZNs for Indian meds
    pzn_rows = await execute_query(
        "SELECT MAX(pzn) as max_pzn FROM product_catalog"
    )
    next_pzn = (pzn_rows[0]["max_pzn"] or 90000000) + 1000

    inserted = 0
    skipped = 0

    for i, med in enumerate(INDIAN_MEDICINES):
        # Check if already exists (idempotent)
        existing = await execute_query(
            "SELECT id FROM product_catalog WHERE product_name = ?",
            (med["name"],),
        )
        if existing:
            skipped += 1
            continue

        ext_id = next_ext_id + i
        pzn = next_pzn + i

        try:
            cat_id = await execute_write(
                """INSERT INTO product_catalog
                   (external_product_id, product_name, pzn, package_size,
                    description, base_price_eur, default_language, rx_required)
                   VALUES (?, ?, ?, ?, ?, ?, 'en', ?)""",
                (ext_id, med["name"], pzn, med["package"],
                 med["desc"], med["price"], int(med["rx"])),
            )

            # Also add inventory with default stock of 100
            await execute_write(
                """INSERT OR IGNORE INTO inventory_items
                   (product_catalog_id, stock_quantity, reorder_threshold, reorder_quantity)
                   VALUES (?, 100, 10, 50)""",
                (cat_id,),
            )
            inserted += 1
        except Exception as e:
            print(f"  ⚠ Failed to insert {med['name']}: {e}")

    print()
    print("╔══════════════════════════════════════════════════╗")
    print("║   INDIAN MEDICINES SEED — COMPLETE ✅            ║")
    print(f"║   Inserted: {inserted:>3}  |  Skipped: {skipped:>3}               ║")
    print("╚══════════════════════════════════════════════════╝")


if __name__ == "__main__":
    asyncio.run(seed_indian_medicines())
