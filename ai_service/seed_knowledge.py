"""Seed knowledge base with sample data for DEMO company."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, text
from app.core.database import async_session_factory
from app.models.knowledge_base import KnowledgeCategory, KnowledgeEntry


SAMPLE_CATEGORIES = [
    {"name": "general_info", "display_name": "General Information", "description": "Restaurant address, phone, general info", "icon": "info", "sort_order": 1},
    {"name": "hours", "display_name": "Operating Hours", "description": "Working hours and special hours", "icon": "clock", "sort_order": 2},
    {"name": "faq", "display_name": "Frequently Asked Questions", "description": "Common customer questions", "icon": "help-circle", "sort_order": 3},
    {"name": "policies", "display_name": "Policies", "description": "Reservation policies, cancellation, dress code", "icon": "file-text", "sort_order": 4},
    {"name": "campaigns", "display_name": "Campaigns & Offers", "description": "Current promotions and discounts", "icon": "tag", "sort_order": 5},
]

SAMPLE_ENTRIES = [
    # General Info
    {
        "category_name": "general_info",
        "title": "Restaurant Address",
        "content": "Our restaurant is located at 123 Main Street, Downtown, New York, NY 10001. We are near the Central Park subway station.",
        "short_answer": "We are at 123 Main Street, Downtown, New York, NY 10001, near Central Park subway station.",
        "keywords": ["address", "location", "where", "directions", "find us"],
        "entry_type": "info",
        "priority": 10,
    },
    {
        "category_name": "general_info",
        "title": "Restaurant Phone Number",
        "content": "You can reach us at +1 (212) 555-0100 for reservations and general inquiries. For large group bookings, please call +1 (212) 555-0101.",
        "short_answer": "Our phone number is +1 (212) 555-0100. For large groups: +1 (212) 555-0101.",
        "keywords": ["phone", "call", "contact", "telephone", "number"],
        "entry_type": "info",
        "priority": 10,
    },
    {
        "category_name": "general_info",
        "title": "About Our Restaurant",
        "content": "We are a modern Mediterranean restaurant established in 2020, specializing in fresh seafood and authentic Italian cuisine. Our chef has 20 years of experience in fine dining. We have indoor and outdoor seating with a capacity of 80 guests.",
        "short_answer": "We're a modern Mediterranean restaurant specializing in fresh seafood and Italian cuisine, with indoor and outdoor seating for 80 guests.",
        "keywords": ["about", "restaurant", "cuisine", "type", "what kind"],
        "entry_type": "info",
        "priority": 8,
    },
    {
        "category_name": "general_info",
        "title": "Parking Information",
        "content": "We offer free valet parking for dinner guests. There is also a public parking garage located one block east on Oak Street, with rates starting at $5/hour. Street parking is available but limited.",
        "short_answer": "Free valet parking for dinner guests. Public garage one block east on Oak Street ($5/hour). Street parking also available.",
        "keywords": ["parking", "valet", "car", "garage", "park"],
        "entry_type": "info",
        "priority": 6,
    },

    # Operating Hours
    {
        "category_name": "hours",
        "title": "Regular Operating Hours",
        "content": "We are open Monday through Thursday from 11:30 AM to 10:00 PM, Friday and Saturday from 11:30 AM to 11:00 PM, and Sunday from 10:00 AM to 9:00 PM (brunch starts at 10 AM). Kitchen closes 30 minutes before closing time.",
        "short_answer": "Mon-Thu: 11:30 AM - 10:00 PM, Fri-Sat: 11:30 AM - 11:00 PM, Sun: 10:00 AM - 9:00 PM. Kitchen closes 30 min early.",
        "keywords": ["hours", "open", "close", "time", "when", "schedule", "working hours"],
        "entry_type": "hours",
        "priority": 10,
    },
    {
        "category_name": "hours",
        "title": "Happy Hour",
        "content": "Happy Hour is available Monday through Friday from 4:00 PM to 6:00 PM. Enjoy 30% off selected cocktails, wines by the glass, and our special bar menu appetizers.",
        "short_answer": "Happy Hour: Mon-Fri 4:00-6:00 PM with 30% off selected cocktails, wines, and bar menu appetizers.",
        "keywords": ["happy hour", "discount", "drinks", "bar", "cocktail"],
        "entry_type": "hours",
        "priority": 7,
    },

    # FAQ
    {
        "category_name": "faq",
        "title": "Do you take walk-ins?",
        "content": "Yes, we accept walk-in guests based on availability. However, we highly recommend making a reservation, especially for Friday and Saturday evenings, as we tend to fill up quickly.",
        "short_answer": "Yes, we accept walk-ins based on availability, but reservations are recommended, especially on weekends.",
        "keywords": ["walk-in", "reservation", "without reservation", "drop in", "no reservation"],
        "entry_type": "faq",
        "priority": 8,
    },
    {
        "category_name": "faq",
        "title": "Do you accommodate dietary restrictions?",
        "content": "Absolutely! We have vegetarian, vegan, and gluten-free options clearly marked on our menu. Our kitchen can also accommodate most food allergies. Please inform your server or mention it when making a reservation.",
        "short_answer": "Yes! We have vegetarian, vegan, and gluten-free options. We can accommodate most food allergies - just let us know.",
        "keywords": ["vegetarian", "vegan", "gluten-free", "allergy", "dietary", "restriction", "special diet"],
        "entry_type": "faq",
        "priority": 8,
    },
    {
        "category_name": "faq",
        "title": "Do you have a kids menu?",
        "content": "Yes, we offer a kids menu for children under 12. It includes child-friendly options like pasta, chicken tenders, mini burgers, and fruit plates. Prices range from $8-$14. High chairs and booster seats are available.",
        "short_answer": "Yes, we have a kids menu for under 12s ($8-$14) with pasta, chicken tenders, mini burgers, and fruit plates. High chairs available.",
        "keywords": ["kids", "children", "child menu", "family", "high chair", "booster"],
        "entry_type": "faq",
        "priority": 6,
    },
    {
        "category_name": "faq",
        "title": "Do you have outdoor seating?",
        "content": "Yes! We have a beautiful outdoor patio that seats up to 30 guests. It's available from April through October, weather permitting. The patio has heaters for cooler evenings.",
        "short_answer": "Yes, we have an outdoor patio (30 seats) available April-October with heaters for cool evenings.",
        "keywords": ["outdoor", "patio", "terrace", "outside", "garden"],
        "entry_type": "faq",
        "priority": 5,
    },
    {
        "category_name": "faq",
        "title": "Can I host a private event?",
        "content": "Yes, we have a private dining room that accommodates up to 25 guests for private events, birthday parties, and corporate dinners. We offer customizable set menus starting at $55 per person. Please contact us at events@restaurant.com or call +1 (212) 555-0101 for bookings.",
        "short_answer": "Yes! Private dining for up to 25 guests with customizable menus starting at $55/person. Contact events@restaurant.com.",
        "keywords": ["private event", "party", "birthday", "corporate", "private room", "event"],
        "entry_type": "faq",
        "priority": 6,
    },

    # Policies
    {
        "category_name": "policies",
        "title": "Reservation Policy",
        "content": "Reservations can be made up to 30 days in advance. We hold tables for 15 minutes past the reservation time. For parties of 6 or more, a credit card is required to hold the reservation. Cancellations should be made at least 4 hours in advance.",
        "short_answer": "Reservations available up to 30 days ahead. Tables held for 15 min. Groups of 6+ need a credit card. Cancel at least 4 hours in advance.",
        "keywords": ["reservation", "policy", "cancel", "cancellation", "booking", "how to reserve"],
        "entry_type": "policy",
        "priority": 9,
    },
    {
        "category_name": "policies",
        "title": "Cancellation Policy",
        "content": "Please cancel your reservation at least 4 hours before your scheduled time. For large groups (6+), a 24-hour cancellation notice is required to avoid a $25 per person cancellation fee. No-shows may be charged the full cancellation fee.",
        "short_answer": "Cancel at least 4 hours before. Groups of 6+: 24-hour notice required or $25/person fee. No-shows may be charged.",
        "keywords": ["cancel", "cancellation", "no show", "fee", "charge"],
        "entry_type": "policy",
        "priority": 9,
    },
    {
        "category_name": "policies",
        "title": "Dress Code",
        "content": "We have a smart casual dress code. Collared shirts, dresses, and clean denim are welcome. We do not allow athletic wear, flip-flops, or tank tops in the main dining room. The patio has a more relaxed dress code.",
        "short_answer": "Smart casual. No athletic wear, flip-flops, or tank tops in the main dining room. Patio is more relaxed.",
        "keywords": ["dress code", "what to wear", "attire", "clothing"],
        "entry_type": "policy",
        "priority": 5,
    },

    # Campaigns
    {
        "category_name": "campaigns",
        "title": "Valentine's Day Special Menu",
        "content": "Celebrate Valentine's Day with our exclusive 4-course prix fixe dinner for $120 per couple. Includes a complimentary glass of champagne, appetizer, choice of main course (filet mignon or lobster), and a shared dessert. Available February 14-16. Reservations required.",
        "short_answer": "Valentine's Day: 4-course prix fixe for $120/couple with champagne. Feb 14-16. Reservations required.",
        "keywords": ["valentine", "special", "romantic", "couple", "february"],
        "entry_type": "campaign",
        "priority": 10,
        "extra_data": {"valid_from": "2026-02-14", "valid_to": "2026-02-16"},
    },
    {
        "category_name": "campaigns",
        "title": "Weekday Lunch Special",
        "content": "Enjoy our weekday lunch special: a 2-course meal for just $22 per person, available Monday through Friday from 11:30 AM to 2:30 PM. Choose from a rotating selection of soups, salads, and main courses. Add a dessert for $6.",
        "short_answer": "Weekday lunch special: 2-course meal for $22, Mon-Fri 11:30 AM - 2:30 PM. Add dessert for $6.",
        "keywords": ["lunch", "special", "deal", "weekday", "affordable"],
        "entry_type": "campaign",
        "priority": 7,
    },
    {
        "category_name": "campaigns",
        "title": "Sunday Brunch",
        "content": "Join us for our famous Sunday Brunch from 10:00 AM to 2:00 PM. Our brunch buffet is $35 per person and includes unlimited mimosas, eggs benedict, pancakes, fresh fruits, pastries, and more. Kids under 5 eat free!",
        "short_answer": "Sunday Brunch: 10 AM - 2 PM, $35/person with unlimited mimosas and buffet. Kids under 5 free!",
        "keywords": ["brunch", "sunday", "buffet", "mimosa", "breakfast"],
        "entry_type": "campaign",
        "priority": 8,
    },
]


async def seed():
    """Seed knowledge base data."""
    async with async_session_factory() as db:
        # Find DEMO company
        result = await db.execute(text("SELECT id FROM companies WHERE code = 'DEMO01' LIMIT 1"))
        row = result.fetchone()
        if not row:
            print("❌ DEMO01 company not found! Please run the backend first.")
            return
        
        company_id = row[0]
        print(f"📌 Company ID: {company_id}")

        # Check if already seeded
        existing = await db.execute(
            select(KnowledgeCategory).where(KnowledgeCategory.company_id == company_id)
        )
        if existing.scalars().first():
            print("⚠️  Knowledge base already seeded. Skipping.")
            return

        # Create categories
        category_map = {}
        for cat_data in SAMPLE_CATEGORIES:
            cat = KnowledgeCategory(company_id=company_id, **cat_data)
            db.add(cat)
            await db.flush()
            category_map[cat_data["name"]] = cat.id
            print(f"  ✅ Category: {cat_data['display_name']}")

        # Create entries
        for entry_data in SAMPLE_ENTRIES:
            cat_name = entry_data.pop("category_name")
            entry = KnowledgeEntry(
                company_id=company_id,
                category_id=category_map.get(cat_name),
                **entry_data,
            )
            db.add(entry)
            print(f"  📝 Entry: {entry_data['title']}")

        await db.commit()
        print(f"\n✅ Seeded {len(SAMPLE_CATEGORIES)} categories and {len(SAMPLE_ENTRIES)} entries for DEMO01")
        print("💡 Run 'sync knowledge-embeddings' endpoint to generate vector embeddings.")


if __name__ == "__main__":
    asyncio.run(seed())
