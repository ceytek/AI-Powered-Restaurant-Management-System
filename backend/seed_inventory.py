"""Seed comprehensive inventory data for DEMO01 restaurant."""
import asyncio
import sys
import os
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
from uuid import uuid4
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, text
from app.core.database import async_session_factory
from app.models.core import Company, User
from app.models.inventory import (
    InventoryCategory, UnitOfMeasure, InventoryItem, StockMovement,
    Supplier, SupplierItem,
)


# ===================== CATEGORIES =====================
CATEGORIES = [
    {"name": "Produce", "description": "Fresh fruits and vegetables", "sort_order": 1},
    {"name": "Meat & Poultry", "description": "Beef, chicken, lamb, pork, and other meats", "sort_order": 2},
    {"name": "Seafood", "description": "Fish, shellfish, and other seafood", "sort_order": 3},
    {"name": "Dairy & Eggs", "description": "Milk, cheese, butter, cream, and eggs", "sort_order": 4},
    {"name": "Dry Goods & Grains", "description": "Rice, pasta, flour, cereals, and legumes", "sort_order": 5},
    {"name": "Oils & Condiments", "description": "Cooking oils, vinegars, sauces, and dressings", "sort_order": 6},
    {"name": "Spices & Seasonings", "description": "Herbs, spices, salt, pepper, and seasoning blends", "sort_order": 7},
    {"name": "Bakery & Bread", "description": "Bread, rolls, pastry items, and baking supplies", "sort_order": 8},
    {"name": "Frozen", "description": "Frozen vegetables, fruits, desserts, and prepared items", "sort_order": 9},
    {"name": "Beverages", "description": "Non-alcoholic drinks, juices, coffee, and tea", "sort_order": 10},
    {"name": "Alcohol", "description": "Wine, beer, spirits, and cocktail ingredients", "sort_order": 11},
    {"name": "Cleaning Supplies", "description": "Sanitizers, detergents, and cleaning equipment", "sort_order": 12},
    {"name": "Paper & Packaging", "description": "Napkins, takeout containers, bags, and wraps", "sort_order": 13},
]

# ===================== UNITS OF MEASURE =====================
UNITS = [
    {"name": "Kilogram", "abbreviation": "kg", "unit_type": "weight", "base_unit": "g", "conversion_factor": 1000},
    {"name": "Gram", "abbreviation": "g", "unit_type": "weight", "base_unit": "g", "conversion_factor": 1},
    {"name": "Pound", "abbreviation": "lb", "unit_type": "weight", "base_unit": "g", "conversion_factor": 453.592},
    {"name": "Ounce", "abbreviation": "oz", "unit_type": "weight", "base_unit": "g", "conversion_factor": 28.3495},
    {"name": "Liter", "abbreviation": "L", "unit_type": "volume", "base_unit": "mL", "conversion_factor": 1000},
    {"name": "Milliliter", "abbreviation": "mL", "unit_type": "volume", "base_unit": "mL", "conversion_factor": 1},
    {"name": "Gallon", "abbreviation": "gal", "unit_type": "volume", "base_unit": "mL", "conversion_factor": 3785.41},
    {"name": "Piece", "abbreviation": "pcs", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
    {"name": "Dozen", "abbreviation": "dz", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 12},
    {"name": "Case", "abbreviation": "cs", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
    {"name": "Box", "abbreviation": "box", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
    {"name": "Bottle", "abbreviation": "btl", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
    {"name": "Bag", "abbreviation": "bag", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
    {"name": "Roll", "abbreviation": "roll", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
    {"name": "Pack", "abbreviation": "pk", "unit_type": "count", "base_unit": "pcs", "conversion_factor": 1},
]

# ===================== SUPPLIERS =====================
SUPPLIERS = [
    {
        "name": "Fresh Farms Direct", "contact_name": "Tom Harrison",
        "email": "orders@freshfarmsdirect.com", "phone": "+1-212-555-4001",
        "address": "450 West Side Hwy, New York, NY 10014",
        "city": "New York", "country": "USA",
        "payment_terms": "Net 15", "delivery_days": "Mon, Wed, Fri",
        "minimum_order": 50.00, "rating": 5,
        "notes": "Premium produce supplier. Organic options available.",
    },
    {
        "name": "Metro Meat Co.", "contact_name": "Frank DeLuca",
        "email": "sales@metromeats.com", "phone": "+1-212-555-4002",
        "address": "800 Washington St, New York, NY 10014",
        "city": "New York", "country": "USA",
        "payment_terms": "Net 30", "delivery_days": "Tue, Thu",
        "minimum_order": 100.00, "rating": 4,
        "notes": "USDA Prime and Choice meats. Dry-aged available.",
    },
    {
        "name": "Atlantic Seafood Market", "contact_name": "Maria Santos",
        "email": "orders@atlanticseafood.com", "phone": "+1-212-555-4003",
        "address": "39 Fulton St, New York, NY 10038",
        "city": "New York", "country": "USA",
        "payment_terms": "COD", "delivery_days": "Daily (5am)",
        "minimum_order": 75.00, "rating": 5,
        "notes": "Fresh daily catch. Wild-caught and sustainable options.",
    },
    {
        "name": "Valley Dairy & Eggs", "contact_name": "Bob Jensen",
        "email": "orders@valleydairy.com", "phone": "+1-518-555-4004",
        "address": "112 Dairy Lane, Kingston, NY 12401",
        "city": "Kingston", "country": "USA",
        "payment_terms": "Net 15", "delivery_days": "Mon, Wed, Fri",
        "minimum_order": 40.00, "rating": 4,
        "notes": "Farm-fresh dairy. Free-range eggs.",
    },
    {
        "name": "NYC Restaurant Supply", "contact_name": "Alex Chen",
        "email": "sales@nycrestaurantsupply.com", "phone": "+1-212-555-4005",
        "address": "555 Bowery, New York, NY 10003",
        "city": "New York", "country": "USA",
        "payment_terms": "Net 30", "delivery_days": "Mon-Fri",
        "minimum_order": 25.00, "rating": 4,
        "notes": "Dry goods, cleaning supplies, paper products. Bulk discounts.",
    },
    {
        "name": "Manhattan Wine & Spirits", "contact_name": "James Taylor",
        "email": "orders@manhattanwine.com", "phone": "+1-212-555-4006",
        "address": "200 5th Ave, New York, NY 10010",
        "city": "New York", "country": "USA",
        "payment_terms": "Net 30", "delivery_days": "Tue, Thu",
        "minimum_order": 200.00, "rating": 5,
        "notes": "Premium wine and spirits. Sommelier consultation available.",
    },
    {
        "name": "Garden State Beverages", "contact_name": "Lisa Park",
        "email": "orders@gsbeverages.com", "phone": "+1-201-555-4007",
        "address": "78 Commerce Dr, Newark, NJ 07102",
        "city": "Newark", "country": "USA",
        "payment_terms": "Net 15", "delivery_days": "Mon, Wed",
        "minimum_order": 30.00, "rating": 3,
        "notes": "Non-alcoholic beverages, juices, coffee, tea.",
    },
]

# ===================== INVENTORY ITEMS =====================
# (name, category, sku, current_stock, min_stock, max_stock, reorder_point, reorder_qty,
#  unit_cost, unit_abbrev, storage_location, storage_temp, expiry_tracking, description)
# Some items are LOW STOCK intentionally for alerts!
ITEMS = [
    # === PRODUCE (Fresh Fruits & Vegetables) ===
    ("Roma Tomatoes", "Produce", "PRD-001", 15.0, 10.0, 50.0, 12.0, 20.0, 2.50, "kg", "Walk-in Cooler A", "2-4°C", True, "Vine-ripened, for sauces and salads"),
    ("Baby Spinach", "Produce", "PRD-002", 3.0, 5.0, 20.0, 6.0, 10.0, 4.80, "kg", "Walk-in Cooler A", "2-4°C", True, "Pre-washed organic baby spinach"),  # LOW
    ("Fresh Basil", "Produce", "PRD-003", 1.5, 2.0, 8.0, 2.5, 4.0, 12.00, "kg", "Walk-in Cooler A", "4-6°C", True, "Italian sweet basil, stems on"),  # LOW
    ("Lemons", "Produce", "PRD-004", 30.0, 15.0, 80.0, 20.0, 40.0, 0.45, "pcs", "Walk-in Cooler A", "4-6°C", True, "Meyer lemons for cocktails and cooking"),
    ("Yellow Onions", "Produce", "PRD-005", 25.0, 10.0, 60.0, 15.0, 25.0, 1.20, "kg", "Dry Storage", "Room temp", False, "Large yellow onions"),
    ("Garlic Bulbs", "Produce", "PRD-006", 8.0, 5.0, 30.0, 7.0, 12.0, 6.50, "kg", "Dry Storage", "Room temp", False, "Fresh garlic bulbs"),
    ("Russet Potatoes", "Produce", "PRD-007", 40.0, 15.0, 80.0, 20.0, 30.0, 0.90, "kg", "Dry Storage", "Cool, dark", False, "For baking, mashing, and frying"),
    ("Mixed Salad Greens", "Produce", "PRD-008", 2.0, 4.0, 15.0, 5.0, 8.0, 5.50, "kg", "Walk-in Cooler A", "2-4°C", True, "Spring mix mesclun blend"),  # LOW
    ("Bell Peppers (Mixed)", "Produce", "PRD-009", 12.0, 6.0, 30.0, 8.0, 15.0, 3.80, "kg", "Walk-in Cooler A", "4-6°C", True, "Red, yellow, and green"),
    ("Fresh Mushrooms", "Produce", "PRD-010", 4.0, 3.0, 15.0, 4.0, 8.0, 7.20, "kg", "Walk-in Cooler A", "2-4°C", True, "Cremini and button mushrooms"),
    ("Avocados", "Produce", "PRD-011", 18.0, 10.0, 40.0, 12.0, 20.0, 1.50, "pcs", "Walk-in Cooler A", "4-6°C", True, "Hass avocados, ripe"),
    ("Fresh Thyme", "Produce", "PRD-012", 0.3, 0.5, 3.0, 0.6, 1.0, 18.00, "kg", "Walk-in Cooler A", "2-4°C", True, "Fresh thyme sprigs"),  # LOW
    ("Carrots", "Produce", "PRD-013", 15.0, 8.0, 40.0, 10.0, 20.0, 1.10, "kg", "Walk-in Cooler A", "2-4°C", True, "Whole carrots, unpeeled"),
    ("Celery", "Produce", "PRD-014", 6.0, 4.0, 20.0, 5.0, 10.0, 1.80, "kg", "Walk-in Cooler A", "2-4°C", True, "Fresh celery stalks"),

    # === MEAT & POULTRY ===
    ("USDA Prime Ribeye", "Meat & Poultry", "MET-001", 8.0, 5.0, 25.0, 6.0, 10.0, 32.00, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "USDA Prime grade, bone-in"),
    ("Chicken Breast (Boneless)", "Meat & Poultry", "MET-002", 12.0, 8.0, 40.0, 10.0, 15.0, 8.50, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "Skinless boneless chicken breast"),
    ("Ground Beef (80/20)", "Meat & Poultry", "MET-003", 6.0, 5.0, 25.0, 6.0, 10.0, 9.80, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "Fresh ground daily for burgers"),
    ("Lamb Rack", "Meat & Poultry", "MET-004", 3.0, 4.0, 15.0, 5.0, 8.0, 28.00, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "Frenched lamb rack"),  # LOW
    ("Duck Breast", "Meat & Poultry", "MET-005", 4.0, 3.0, 12.0, 4.0, 6.0, 22.50, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "Moulard duck breast, skin-on"),
    ("Pancetta", "Meat & Poultry", "MET-006", 2.5, 2.0, 10.0, 3.0, 5.0, 18.00, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "Italian cured pork belly"),
    ("Beef Tenderloin", "Meat & Poultry", "MET-007", 5.0, 4.0, 20.0, 5.0, 8.0, 45.00, "kg", "Walk-in Cooler B (Meat)", "0-2°C", True, "Center-cut filet mignon grade"),

    # === SEAFOOD ===
    ("Atlantic Salmon Fillet", "Seafood", "FISH-001", 6.0, 5.0, 20.0, 6.0, 10.0, 16.50, "kg", "Walk-in Cooler C (Seafood)", "0-1°C", True, "Fresh Norwegian salmon, skin-on"),
    ("Jumbo Shrimp (16/20)", "Seafood", "FISH-002", 4.0, 3.0, 15.0, 4.0, 8.0, 19.00, "kg", "Freezer A", "-18°C", True, "Peeled and deveined"),
    ("Sea Bass Fillet", "Seafood", "FISH-003", 2.5, 3.0, 12.0, 4.0, 6.0, 24.00, "kg", "Walk-in Cooler C (Seafood)", "0-1°C", True, "Chilean sea bass, fresh"),  # LOW
    ("Fresh Mussels", "Seafood", "FISH-004", 5.0, 4.0, 20.0, 5.0, 10.0, 6.50, "kg", "Walk-in Cooler C (Seafood)", "0-2°C", True, "PEI mussels, live"),
    ("Tuna Sashimi Grade", "Seafood", "FISH-005", 1.5, 2.0, 8.0, 2.5, 4.0, 38.00, "kg", "Walk-in Cooler C (Seafood)", "0-1°C", True, "Ahi tuna, #1 grade"),  # LOW

    # === DAIRY & EGGS ===
    ("Heavy Cream", "Dairy & Eggs", "DRY-001", 8.0, 5.0, 25.0, 6.0, 12.0, 4.80, "L", "Walk-in Cooler A", "2-4°C", True, "36% butterfat heavy whipping cream"),
    ("Unsalted Butter", "Dairy & Eggs", "DRY-002", 10.0, 6.0, 30.0, 8.0, 12.0, 5.50, "kg", "Walk-in Cooler A", "2-4°C", True, "European-style, 82% butterfat"),
    ("Parmesan Reggiano", "Dairy & Eggs", "DRY-003", 3.0, 2.0, 10.0, 3.0, 5.0, 22.00, "kg", "Walk-in Cooler A", "4-6°C", True, "Aged 24 months, DOP certified"),
    ("Farm Fresh Eggs (Large)", "Dairy & Eggs", "DRY-004", 5.0, 8.0, 30.0, 10.0, 15.0, 4.50, "dz", "Walk-in Cooler A", "2-4°C", True, "Free-range, grade AA"),  # LOW
    ("Whole Milk", "Dairy & Eggs", "DRY-005", 15.0, 8.0, 40.0, 10.0, 20.0, 3.20, "L", "Walk-in Cooler A", "2-4°C", True, "Pasteurized whole milk"),
    ("Mozzarella (Fresh)", "Dairy & Eggs", "DRY-006", 4.0, 3.0, 15.0, 4.0, 6.0, 12.00, "kg", "Walk-in Cooler A", "2-4°C", True, "Fresh buffalo mozzarella"),
    ("Goat Cheese", "Dairy & Eggs", "DRY-007", 2.0, 1.5, 8.0, 2.0, 4.0, 16.00, "kg", "Walk-in Cooler A", "2-4°C", True, "Chèvre, plain"),
    ("Sour Cream", "Dairy & Eggs", "DRY-008", 3.0, 2.0, 10.0, 3.0, 5.0, 3.50, "L", "Walk-in Cooler A", "2-4°C", True, "Full-fat sour cream"),

    # === DRY GOODS & GRAINS ===
    ("All-Purpose Flour", "Dry Goods & Grains", "DRG-001", 20.0, 10.0, 50.0, 12.0, 25.0, 1.20, "kg", "Dry Storage Shelf A", "Room temp", False, "Unbleached all-purpose flour"),
    ("Arborio Rice", "Dry Goods & Grains", "DRG-002", 8.0, 5.0, 25.0, 6.0, 10.0, 4.50, "kg", "Dry Storage Shelf A", "Room temp", False, "Italian short-grain for risotto"),
    ("Penne Pasta", "Dry Goods & Grains", "DRG-003", 12.0, 6.0, 30.0, 8.0, 15.0, 2.80, "kg", "Dry Storage Shelf A", "Room temp", False, "Bronze-cut Italian penne"),
    ("Spaghetti", "Dry Goods & Grains", "DRG-004", 10.0, 6.0, 30.0, 8.0, 15.0, 2.50, "kg", "Dry Storage Shelf A", "Room temp", False, "De Cecco spaghetti"),
    ("Panko Breadcrumbs", "Dry Goods & Grains", "DRG-005", 5.0, 3.0, 15.0, 4.0, 8.0, 3.80, "kg", "Dry Storage Shelf A", "Room temp", False, "Japanese-style breadcrumbs"),
    ("Canned San Marzano Tomatoes", "Dry Goods & Grains", "DRG-006", 18.0, 10.0, 40.0, 12.0, 20.0, 3.20, "pcs", "Dry Storage Shelf B", "Room temp", False, "DOP 28oz cans"),
    ("Chicken Stock", "Dry Goods & Grains", "DRG-007", 10.0, 8.0, 30.0, 10.0, 15.0, 2.50, "L", "Dry Storage Shelf B", "Room temp", False, "Low-sodium chicken stock"),
    ("Dried Black Beans", "Dry Goods & Grains", "DRG-008", 6.0, 3.0, 15.0, 4.0, 8.0, 2.20, "kg", "Dry Storage Shelf A", "Room temp", False, "Dried black beans, bulk"),

    # === OILS & CONDIMENTS ===
    ("Extra Virgin Olive Oil", "Oils & Condiments", "OIL-001", 8.0, 4.0, 20.0, 5.0, 10.0, 12.00, "L", "Dry Storage Shelf C", "Room temp", False, "Cold-pressed Italian EVOO"),
    ("Balsamic Vinegar", "Oils & Condiments", "OIL-002", 3.0, 2.0, 10.0, 3.0, 5.0, 8.50, "L", "Dry Storage Shelf C", "Room temp", False, "Aged Modena balsamic"),
    ("Soy Sauce", "Oils & Condiments", "OIL-003", 4.0, 2.0, 10.0, 3.0, 5.0, 4.50, "L", "Dry Storage Shelf C", "Room temp", False, "Naturally brewed soy sauce"),
    ("Dijon Mustard", "Oils & Condiments", "OIL-004", 2.5, 1.5, 8.0, 2.0, 4.0, 5.80, "kg", "Walk-in Cooler A", "2-4°C", False, "French Dijon mustard"),
    ("Hot Sauce (Sriracha)", "Oils & Condiments", "OIL-005", 3.0, 2.0, 10.0, 2.5, 5.0, 3.50, "btl", "Dry Storage Shelf C", "Room temp", False, "Huy Fong Sriracha 17oz"),
    ("Truffle Oil", "Oils & Condiments", "OIL-006", 0.8, 1.0, 5.0, 1.2, 2.0, 28.00, "btl", "Dry Storage Shelf C", "Room temp", False, "Black truffle infused olive oil"),  # LOW
    ("Vegetable Oil", "Oils & Condiments", "OIL-007", 12.0, 5.0, 30.0, 8.0, 15.0, 3.00, "L", "Dry Storage Shelf C", "Room temp", False, "Refined canola/vegetable blend"),
    ("Worcestershire Sauce", "Oils & Condiments", "OIL-008", 2.0, 1.0, 6.0, 1.5, 3.0, 4.20, "btl", "Dry Storage Shelf C", "Room temp", False, "Lea & Perrins"),

    # === SPICES & SEASONINGS ===
    ("Kosher Salt", "Spices & Seasonings", "SPC-001", 8.0, 3.0, 20.0, 5.0, 10.0, 2.50, "kg", "Spice Rack", "Room temp", False, "Diamond Crystal kosher salt"),
    ("Black Pepper (Whole)", "Spices & Seasonings", "SPC-002", 2.0, 1.0, 8.0, 1.5, 3.0, 15.00, "kg", "Spice Rack", "Room temp", False, "Tellicherry black peppercorns"),
    ("Smoked Paprika", "Spices & Seasonings", "SPC-003", 0.5, 0.3, 3.0, 0.5, 1.0, 18.00, "kg", "Spice Rack", "Room temp", False, "Spanish pimentón de la Vera"),
    ("Cumin (Ground)", "Spices & Seasonings", "SPC-004", 0.8, 0.3, 3.0, 0.5, 1.0, 14.00, "kg", "Spice Rack", "Room temp", False, "Freshly ground cumin"),
    ("Red Pepper Flakes", "Spices & Seasonings", "SPC-005", 0.6, 0.3, 3.0, 0.4, 1.0, 12.00, "kg", "Spice Rack", "Room temp", False, "Crushed red pepper"),
    ("Bay Leaves", "Spices & Seasonings", "SPC-006", 0.2, 0.1, 1.0, 0.15, 0.3, 25.00, "kg", "Spice Rack", "Room temp", False, "Dried Turkish bay leaves"),
    ("Vanilla Extract", "Spices & Seasonings", "SPC-007", 0.5, 0.5, 3.0, 0.6, 1.0, 45.00, "L", "Spice Rack", "Room temp", False, "Pure Madagascar vanilla"),

    # === BAKERY & BREAD ===
    ("Sourdough Bread", "Bakery & Bread", "BKR-001", 8.0, 6.0, 20.0, 8.0, 12.0, 4.50, "pcs", "Bread Station", "Room temp", True, "House-style artisan sourdough loaves"),
    ("Brioche Buns", "Bakery & Bread", "BKR-002", 12.0, 10.0, 40.0, 12.0, 24.0, 1.20, "pcs", "Bread Station", "Room temp", True, "For burgers, toasted"),
    ("Pizza Dough Balls", "Bakery & Bread", "BKR-003", 10.0, 8.0, 30.0, 10.0, 15.0, 1.50, "pcs", "Walk-in Cooler A", "2-4°C", True, "250g pre-portioned dough balls"),
    ("Ciabatta Rolls", "Bakery & Bread", "BKR-004", 4.0, 6.0, 24.0, 8.0, 12.0, 0.90, "pcs", "Bread Station", "Room temp", True, "Italian ciabatta rolls"),  # LOW

    # === FROZEN ===
    ("Frozen French Fries", "Frozen", "FRZ-001", 15.0, 8.0, 40.0, 10.0, 20.0, 3.50, "kg", "Freezer B", "-18°C", False, "Straight-cut, par-cooked"),
    ("Frozen Puff Pastry Sheets", "Frozen", "FRZ-002", 6.0, 4.0, 20.0, 5.0, 10.0, 5.80, "pk", "Freezer B", "-18°C", False, "All-butter puff pastry"),
    ("Frozen Mixed Berries", "Frozen", "FRZ-003", 3.0, 4.0, 15.0, 5.0, 8.0, 6.50, "kg", "Freezer A", "-18°C", False, "Strawberry, blueberry, raspberry mix"),  # LOW
    ("Ice Cream (Vanilla)", "Frozen", "FRZ-004", 5.0, 3.0, 15.0, 4.0, 8.0, 8.00, "L", "Freezer A", "-18°C", False, "Premium French vanilla"),

    # === BEVERAGES ===
    ("Espresso Coffee Beans", "Beverages", "BEV-001", 3.0, 5.0, 20.0, 6.0, 10.0, 18.00, "kg", "Bar Station", "Room temp", True, "Medium-dark roast Italian blend"),  # LOW
    ("San Pellegrino Sparkling Water", "Beverages", "BEV-002", 24.0, 12.0, 60.0, 18.0, 24.0, 1.20, "btl", "Dry Storage Shelf D", "Room temp", False, "750mL glass bottles"),
    ("Fresh Orange Juice", "Beverages", "BEV-003", 6.0, 4.0, 15.0, 5.0, 8.0, 5.50, "L", "Walk-in Cooler A", "2-4°C", True, "Freshly squeezed daily"),
    ("Coca-Cola (Can)", "Beverages", "BEV-004", 36.0, 24.0, 96.0, 30.0, 48.0, 0.65, "pcs", "Dry Storage Shelf D", "Room temp", False, "12oz cans"),
    ("Tonic Water", "Beverages", "BEV-005", 18.0, 12.0, 48.0, 15.0, 24.0, 0.95, "btl", "Bar Station", "Room temp", False, "Fever-Tree premium tonic, 200mL"),
    ("English Breakfast Tea", "Beverages", "BEV-006", 4.0, 2.0, 10.0, 3.0, 5.0, 8.50, "box", "Bar Station", "Room temp", False, "50 tea bags per box"),

    # === ALCOHOL ===
    ("House Red Wine (Cabernet)", "Alcohol", "ALC-001", 12.0, 6.0, 30.0, 8.0, 12.0, 9.50, "btl", "Wine Cellar", "14-16°C", False, "California Cabernet Sauvignon"),
    ("House White Wine (Chardonnay)", "Alcohol", "ALC-002", 10.0, 6.0, 30.0, 8.0, 12.0, 8.50, "btl", "Wine Cellar", "14-16°C", False, "Sonoma Chardonnay"),
    ("Prosecco", "Alcohol", "ALC-003", 8.0, 4.0, 20.0, 6.0, 10.0, 11.00, "btl", "Wine Cellar", "6-8°C", False, "Italian DOC Prosecco"),
    ("Craft IPA Beer", "Alcohol", "ALC-004", 24.0, 12.0, 60.0, 18.0, 24.0, 2.80, "btl", "Walk-in Cooler D (Bar)", "2-4°C", False, "Local craft IPA, 12oz"),
    ("Premium Vodka", "Alcohol", "ALC-005", 3.0, 2.0, 10.0, 3.0, 4.0, 28.00, "btl", "Bar Station", "Room temp", False, "Grey Goose 750mL"),
    ("Bourbon Whiskey", "Alcohol", "ALC-006", 2.0, 2.0, 8.0, 3.0, 4.0, 32.00, "btl", "Bar Station", "Room temp", False, "Maker's Mark 750mL"),
    ("Triple Sec", "Alcohol", "ALC-007", 1.0, 1.5, 6.0, 2.0, 3.0, 12.00, "btl", "Bar Station", "Room temp", False, "Cointreau 750mL"),  # LOW
    ("Gin (London Dry)", "Alcohol", "ALC-008", 2.5, 2.0, 8.0, 3.0, 4.0, 26.00, "btl", "Bar Station", "Room temp", False, "Tanqueray 750mL"),

    # === CLEANING SUPPLIES ===
    ("Commercial Dish Soap", "Cleaning Supplies", "CLN-001", 8.0, 4.0, 20.0, 5.0, 10.0, 6.50, "L", "Cleaning Closet", "Room temp", False, "Heavy-duty degreasing dish soap"),
    ("Surface Sanitizer", "Cleaning Supplies", "CLN-002", 3.0, 4.0, 15.0, 5.0, 8.0, 8.50, "L", "Cleaning Closet", "Room temp", False, "Food-safe surface sanitizer spray"),  # LOW
    ("Floor Cleaner", "Cleaning Supplies", "CLN-003", 6.0, 3.0, 15.0, 4.0, 8.0, 5.50, "L", "Cleaning Closet", "Room temp", False, "Non-slip floor cleaner concentrate"),
    ("Stainless Steel Polish", "Cleaning Supplies", "CLN-004", 2.0, 1.0, 6.0, 1.5, 3.0, 7.80, "btl", "Cleaning Closet", "Room temp", False, "Equipment polish spray"),
    ("Hand Soap (Foaming)", "Cleaning Supplies", "CLN-005", 6.0, 4.0, 15.0, 5.0, 8.0, 4.20, "btl", "Cleaning Closet", "Room temp", False, "Antibacterial foaming hand soap"),
    ("Latex Gloves (L)", "Cleaning Supplies", "CLN-006", 3.0, 5.0, 20.0, 6.0, 10.0, 12.00, "box", "Cleaning Closet", "Room temp", False, "Powder-free, 100 per box"),  # LOW

    # === PAPER & PACKAGING ===
    ("Cocktail Napkins", "Paper & Packaging", "PAP-001", 15.0, 8.0, 40.0, 10.0, 20.0, 3.50, "pk", "Dry Storage Shelf E", "Room temp", False, "White, 2-ply, 250 per pack"),
    ("Dinner Napkins (Linen-feel)", "Paper & Packaging", "PAP-002", 10.0, 6.0, 30.0, 8.0, 15.0, 6.80, "pk", "Dry Storage Shelf E", "Room temp", False, "Premium linen-feel, 100 per pack"),
    ("To-Go Containers (Large)", "Paper & Packaging", "PAP-003", 40.0, 25.0, 100.0, 30.0, 50.0, 0.35, "pcs", "Dry Storage Shelf E", "Room temp", False, "32oz compostable containers"),
    ("Plastic Wrap (18\")", "Paper & Packaging", "PAP-004", 3.0, 2.0, 10.0, 3.0, 5.0, 8.50, "roll", "Kitchen Station", "Room temp", False, "Commercial 18\" food wrap"),
    ("Aluminum Foil (18\")", "Paper & Packaging", "PAP-005", 2.0, 2.0, 8.0, 3.0, 4.0, 12.00, "roll", "Kitchen Station", "Room temp", False, "Heavy-duty 18\" foil"),
    ("Paper Bags (Medium)", "Paper & Packaging", "PAP-006", 50.0, 30.0, 150.0, 40.0, 60.0, 0.12, "pcs", "Dry Storage Shelf E", "Room temp", False, "Brown kraft takeout bags"),
]


async def seed():
    async with async_session_factory() as db:
        # 1. Get DEMO01 company
        result = await db.execute(select(Company).where(Company.code == "DEMO01"))
        company = result.scalar_one_or_none()
        if not company:
            print("❌ DEMO01 company not found.")
            return
        cid = company.id
        print(f"✅ Found company: {company.name} ({cid})")

        # Get admin user for performed_by
        admin_q = await db.execute(select(User).where(User.company_id == cid, User.email == "admin@demo.com"))
        admin = admin_q.scalar_one_or_none()
        admin_id = admin.id if admin else None

        # 2. Clear existing inventory data
        print("   🗑️  Clearing old inventory data...")
        await db.execute(text("DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id = :cid)"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM purchase_orders WHERE company_id = :cid"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM supplier_items WHERE supplier_id IN (SELECT id FROM suppliers WHERE company_id = :cid)"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM stock_movements WHERE company_id = :cid"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM inventory_items WHERE company_id = :cid"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM inventory_categories WHERE company_id = :cid"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM units_of_measure WHERE company_id = :cid"), {"cid": str(cid)})
        await db.execute(text("DELETE FROM suppliers WHERE company_id = :cid"), {"cid": str(cid)})
        await db.flush()

        # 3. Create Categories
        cat_map = {}
        for cat_data in CATEGORIES:
            cat = InventoryCategory(company_id=cid, **cat_data)
            db.add(cat)
            await db.flush()
            cat_map[cat_data["name"]] = cat.id
        print(f"✅ Created {len(CATEGORIES)} categories")

        # 4. Create Units
        unit_map = {}
        for unit_data in UNITS:
            unit = UnitOfMeasure(company_id=cid, **unit_data)
            db.add(unit)
            await db.flush()
            unit_map[unit_data["abbreviation"]] = unit.id
        print(f"✅ Created {len(UNITS)} units of measure")

        # 5. Create Suppliers
        supplier_ids = []
        for sup_data in SUPPLIERS:
            sup = Supplier(company_id=cid, created_by=admin_id, **sup_data)
            db.add(sup)
            await db.flush()
            supplier_ids.append(sup.id)
        print(f"✅ Created {len(SUPPLIERS)} suppliers")

        # 6. Create Items + Initial Stock Movements
        item_count = 0
        low_stock_count = 0
        movement_count = 0
        now = datetime.now(timezone.utc)

        for item_data in ITEMS:
            (name, cat_name, sku, stock, min_stock, max_stock, reorder_pt, reorder_qty,
             cost, unit_abbr, location, temp, expiry, desc) = item_data

            is_low = stock <= min_stock

            item = InventoryItem(
                company_id=cid,
                category_id=cat_map.get(cat_name),
                unit_id=unit_map.get(unit_abbr),
                name=name,
                description=desc,
                sku=sku,
                current_stock=stock,
                minimum_stock=min_stock,
                maximum_stock=max_stock,
                reorder_point=reorder_pt,
                reorder_quantity=reorder_qty,
                unit_cost=cost,
                storage_location=location,
                storage_temperature=temp,
                expiry_tracking=expiry,
                is_active=True,
                created_by=admin_id,
            )
            db.add(item)
            await db.flush()

            # Create initial stock movement
            mv = StockMovement(
                company_id=cid,
                inventory_item_id=item.id,
                movement_type="initial",
                quantity=stock,
                unit_cost=cost,
                total_cost=round(float(stock) * float(cost), 2),
                stock_before=0,
                stock_after=stock,
                notes="Initial inventory setup",
                performed_by=admin_id,
                performed_at=now - timedelta(days=random.randint(5, 30)),
            )
            db.add(mv)
            movement_count += 1

            # Add some recent purchase movements (simulating real usage)
            if random.random() < 0.6:
                purchase_qty = round(float(reorder_qty) * random.uniform(0.5, 1.5), 1)
                purchase_date = now - timedelta(days=random.randint(1, 7))
                mv2 = StockMovement(
                    company_id=cid,
                    inventory_item_id=item.id,
                    movement_type="purchase",
                    quantity=purchase_qty,
                    unit_cost=cost,
                    total_cost=round(purchase_qty * float(cost), 2),
                    stock_before=stock - purchase_qty if stock > purchase_qty else 0,
                    stock_after=stock,
                    reference_type="manual",
                    notes="Regular supplier delivery",
                    performed_by=admin_id,
                    performed_at=purchase_date,
                )
                db.add(mv2)
                movement_count += 1

            # Add some usage movements
            if random.random() < 0.7:
                usage_qty = -round(float(stock) * random.uniform(0.05, 0.2), 1)
                usage_date = now - timedelta(hours=random.randint(2, 48))
                stock_before_usage = stock
                stock_after_usage = stock + usage_qty
                mv3 = StockMovement(
                    company_id=cid,
                    inventory_item_id=item.id,
                    movement_type="usage",
                    quantity=usage_qty,
                    unit_cost=cost,
                    total_cost=round(abs(usage_qty) * float(cost), 2),
                    stock_before=stock_before_usage,
                    stock_after=stock_after_usage,
                    reference_type="kitchen",
                    notes="Daily kitchen usage",
                    performed_by=admin_id,
                    performed_at=usage_date,
                )
                db.add(mv3)
                movement_count += 1

            # Some waste (occasional)
            if random.random() < 0.15:
                waste_qty = -round(float(stock) * random.uniform(0.02, 0.08), 2)
                waste_date = now - timedelta(days=random.randint(1, 5))
                mv4 = StockMovement(
                    company_id=cid,
                    inventory_item_id=item.id,
                    movement_type="waste",
                    quantity=waste_qty,
                    unit_cost=cost,
                    total_cost=round(abs(waste_qty) * float(cost), 2),
                    stock_before=stock,
                    stock_after=stock + waste_qty,
                    notes="Spoiled / expired items discarded",
                    performed_by=admin_id,
                    performed_at=waste_date,
                )
                db.add(mv4)
                movement_count += 1

            item_count += 1
            if is_low:
                low_stock_count += 1
                status_icon = "🔴"
            else:
                status_icon = "🟢"
            print(f"   {status_icon} {name} ({sku}) — Stock: {stock} {unit_abbr}, Min: {min_stock}")

        await db.flush()

        # 7. Create some supplier-item links
        supplier_item_count = 0
        all_items_q = await db.execute(select(InventoryItem).where(InventoryItem.company_id == cid))
        all_items = all_items_q.scalars().all()

        # Map categories to suppliers
        cat_supplier_map = {
            "Produce": 0,           # Fresh Farms Direct
            "Meat & Poultry": 1,    # Metro Meat Co.
            "Seafood": 2,           # Atlantic Seafood
            "Dairy & Eggs": 3,      # Valley Dairy
            "Dry Goods & Grains": 4, # NYC Restaurant Supply
            "Oils & Condiments": 4,
            "Spices & Seasonings": 4,
            "Bakery & Bread": 0,
            "Frozen": 4,
            "Beverages": 6,         # Garden State Beverages
            "Alcohol": 5,           # Manhattan Wine & Spirits
            "Cleaning Supplies": 4,
            "Paper & Packaging": 4,
        }

        for item in all_items:
            cat_name_q = await db.execute(select(InventoryCategory.name).where(InventoryCategory.id == item.category_id))
            cat_name_row = cat_name_q.scalar_one_or_none()
            if cat_name_row and cat_name_row in cat_supplier_map:
                sup_idx = cat_supplier_map[cat_name_row]
                si = SupplierItem(
                    supplier_id=supplier_ids[sup_idx],
                    inventory_item_id=item.id,
                    unit_cost=item.unit_cost,
                    is_preferred=True,
                    lead_time_days=random.choice([1, 2, 3]),
                )
                db.add(si)
                supplier_item_count += 1

        await db.flush()
        await db.commit()

        print(f"\n🎉 Inventory seeding complete!")
        print(f"   📦 {item_count} items ({low_stock_count} low stock)")
        print(f"   📂 {len(CATEGORIES)} categories")
        print(f"   📏 {len(UNITS)} units of measure")
        print(f"   🚚 {len(SUPPLIERS)} suppliers")
        print(f"   🔗 {supplier_item_count} supplier-item links")
        print(f"   📊 {movement_count} stock movements")
        print(f"   ⚠️  {low_stock_count} items below minimum stock!")


if __name__ == "__main__":
    asyncio.run(seed())
