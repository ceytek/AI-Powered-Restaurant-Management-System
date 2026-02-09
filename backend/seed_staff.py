"""Seed staff data: positions, shifts, users, profiles, and schedules for DEMO company."""
import asyncio
import sys
import os
from datetime import date, time, timedelta
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, text
from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models.core import Company, User, Role, UserRole
from app.models.staff import StaffPosition, StaffProfile, Shift, StaffSchedule


# ===================== POSITIONS =====================
POSITIONS = [
    # Kitchen
    {"name": "Head Chef", "department": "kitchen", "description": "Leads the kitchen, designs menus, oversees all food preparation", "base_hourly_rate": 35.00, "color": "#E53935", "sort_order": 1},
    {"name": "Sous Chef", "department": "kitchen", "description": "Second in command, assists the Head Chef, manages kitchen staff", "base_hourly_rate": 28.00, "color": "#D32F2F", "sort_order": 2},
    {"name": "Line Cook", "department": "kitchen", "description": "Prepares dishes at their station: grill, sauté, fry, etc.", "base_hourly_rate": 18.00, "color": "#C62828", "sort_order": 3},
    {"name": "Prep Cook", "department": "kitchen", "description": "Prepares ingredients: chopping, marinating, portioning", "base_hourly_rate": 15.00, "color": "#B71C1C", "sort_order": 4},
    {"name": "Pastry Chef", "department": "kitchen", "description": "Specializes in desserts, pastries, and baked goods", "base_hourly_rate": 25.00, "color": "#F06292", "sort_order": 5},
    # Service
    {"name": "Head Waiter", "department": "service", "description": "Leads the waitstaff, handles VIP tables, trains new staff", "base_hourly_rate": 22.00, "color": "#1E88E5", "sort_order": 6},
    {"name": "Waiter", "department": "service", "description": "Takes orders, serves food and drinks, handles payments", "base_hourly_rate": 16.00, "color": "#1976D2", "sort_order": 7},
    {"name": "Busser", "department": "service", "description": "Clears and resets tables, assists waiters, keeps dining area clean", "base_hourly_rate": 13.00, "color": "#1565C0", "sort_order": 8},
    {"name": "Host / Hostess", "department": "service", "description": "Greets guests, manages reservations, seats customers", "base_hourly_rate": 17.00, "color": "#42A5F5", "sort_order": 9},
    # Bar
    {"name": "Head Bartender", "department": "bar", "description": "Manages the bar, creates cocktail menus, trains bartenders", "base_hourly_rate": 24.00, "color": "#7B1FA2", "sort_order": 10},
    {"name": "Bartender", "department": "bar", "description": "Mixes and serves drinks, manages bar inventory", "base_hourly_rate": 18.00, "color": "#9C27B0", "sort_order": 11},
    # Management
    {"name": "General Manager", "department": "management", "description": "Overall restaurant operations, financials, and staff management", "base_hourly_rate": 40.00, "color": "#FF8F00", "sort_order": 12},
    {"name": "Assistant Manager", "department": "management", "description": "Assists GM, handles daily operations and customer issues", "base_hourly_rate": 30.00, "color": "#FFA000", "sort_order": 13},
    # Cleaning
    {"name": "Dishwasher", "department": "cleaning", "description": "Washes dishes, pots, and pans; keeps kitchen clean", "base_hourly_rate": 13.00, "color": "#00897B", "sort_order": 14},
    {"name": "Cleaner", "department": "cleaning", "description": "Responsible for overall restaurant cleanliness and hygiene", "base_hourly_rate": 14.00, "color": "#00796B", "sort_order": 15},
]

# ===================== SHIFTS =====================
SHIFTS = [
    {"name": "Morning", "start_time": time(7, 0), "end_time": time(15, 0), "break_duration": 30, "color": "#FFC107"},
    {"name": "Afternoon", "start_time": time(11, 0), "end_time": time(19, 0), "break_duration": 30, "color": "#FF9800"},
    {"name": "Evening", "start_time": time(16, 0), "end_time": time(0, 0), "break_duration": 30, "color": "#3F51B5"},
    {"name": "Night", "start_time": time(20, 0), "end_time": time(4, 0), "break_duration": 30, "color": "#263238"},
    {"name": "Split AM", "start_time": time(10, 0), "end_time": time(14, 0), "break_duration": 0, "color": "#8BC34A"},
    {"name": "Split PM", "start_time": time(17, 0), "end_time": time(22, 0), "break_duration": 0, "color": "#4CAF50"},
]

# ===================== STAFF MEMBERS =====================
# (first_name, last_name, email, phone, position_name, role_name, employee_number,
#  hire_date, birth_date, contract_type, hourly_rate, city, address,
#  emergency_contact_name, emergency_contact_phone, emergency_contact_relation)
STAFF_MEMBERS = [
    # Management
    ("Robert", "Mitchell", "robert.mitchell@demo.com", "+1-212-555-0201",
     "General Manager", "manager", "EMP-001",
     "2021-03-15", "1978-06-22", "full_time", 42.00, "New York",
     "145 West 67th St, Apt 3B, New York, NY 10023",
     "Sarah Mitchell", "+1-212-555-0301", "Spouse"),

    ("Jennifer", "Park", "jennifer.park@demo.com", "+1-212-555-0202",
     "Assistant Manager", "manager", "EMP-002",
     "2022-01-10", "1985-11-05", "full_time", 32.00, "Brooklyn",
     "88 Atlantic Ave, Brooklyn, NY 11201",
     "David Park", "+1-718-555-0302", "Brother"),

    # Kitchen
    ("Marco", "Rossi", "marco.rossi@demo.com", "+1-212-555-0203",
     "Head Chef", "chef", "EMP-003",
     "2020-06-01", "1980-03-14", "full_time", 38.00, "Manhattan",
     "220 East 23rd St, New York, NY 10010",
     "Elena Rossi", "+1-212-555-0303", "Spouse"),

    ("Akira", "Tanaka", "akira.tanaka@demo.com", "+1-212-555-0204",
     "Sous Chef", "chef", "EMP-004",
     "2021-09-20", "1988-07-30", "full_time", 30.00, "Queens",
     "41-15 Kissena Blvd, Flushing, NY 11355",
     "Yuki Tanaka", "+1-718-555-0304", "Spouse"),

    ("Carlos", "Rivera", "carlos.rivera@demo.com", "+1-212-555-0205",
     "Line Cook", "chef", "EMP-005",
     "2022-04-15", "1992-12-08", "full_time", 19.00, "Bronx",
     "560 Grand Concourse, Bronx, NY 10451",
     "Maria Rivera", "+1-718-555-0305", "Mother"),

    ("Emily", "Chen", "emily.chen@demo.com", "+1-212-555-0206",
     "Line Cook", "chef", "EMP-006",
     "2023-02-01", "1995-04-17", "full_time", 18.50, "Manhattan",
     "315 East 12th St, New York, NY 10003",
     "Li Chen", "+1-212-555-0306", "Father"),

    ("James", "O'Brien", "james.obrien@demo.com", "+1-212-555-0207",
     "Prep Cook", "chef", "EMP-007",
     "2023-06-10", "1998-01-25", "part_time", 15.50, "Brooklyn",
     "150 Court St, Brooklyn, NY 11201",
     "Katherine O'Brien", "+1-718-555-0307", "Mother"),

    ("Sophie", "Laurent", "sophie.laurent@demo.com", "+1-212-555-0208",
     "Pastry Chef", "chef", "EMP-008",
     "2021-11-01", "1987-09-12", "full_time", 26.00, "Manhattan",
     "78 Christopher St, New York, NY 10014",
     "Pierre Laurent", "+1-212-555-0308", "Brother"),

    # Service
    ("Michael", "Thompson", "michael.thompson@demo.com", "+1-212-555-0209",
     "Head Waiter", "waiter", "EMP-009",
     "2021-05-20", "1990-02-28", "full_time", 23.00, "Manhattan",
     "425 East 51st St, New York, NY 10022",
     "Susan Thompson", "+1-212-555-0309", "Mother"),

    ("Olivia", "Williams", "olivia.williams@demo.com", "+1-212-555-0210",
     "Waiter", "waiter", "EMP-010",
     "2022-08-15", "1997-06-03", "full_time", 16.50, "Brooklyn",
     "200 Eastern Parkway, Brooklyn, NY 11238",
     "Thomas Williams", "+1-718-555-0310", "Father"),

    ("Daniel", "Kim", "daniel.kim@demo.com", "+1-212-555-0211",
     "Waiter", "waiter", "EMP-011",
     "2023-01-15", "1999-10-20", "part_time", 16.00, "Queens",
     "72-10 Broadway, Jackson Heights, NY 11372",
     "Min Kim", "+1-718-555-0311", "Mother"),

    ("Isabella", "Garcia", "isabella.garcia@demo.com", "+1-212-555-0212",
     "Waiter", "waiter", "EMP-012",
     "2023-09-01", "2000-03-14", "part_time", 16.00, "Manhattan",
     "180 West 81st St, New York, NY 10024",
     "Rosa Garcia", "+1-212-555-0312", "Mother"),

    ("Lucas", "Anderson", "lucas.anderson@demo.com", "+1-212-555-0213",
     "Busser", "waiter", "EMP-013",
     "2024-01-05", "2002-08-11", "part_time", 13.50, "Bronx",
     "1205 Grand Concourse, Bronx, NY 10452",
     "Diana Anderson", "+1-718-555-0313", "Mother"),

    ("Emma", "Davis", "emma.davis@demo.com", "+1-212-555-0214",
     "Host / Hostess", "host", "EMP-014",
     "2022-06-01", "1996-12-30", "full_time", 18.00, "Manhattan",
     "55 West 46th St, New York, NY 10036",
     "Richard Davis", "+1-212-555-0314", "Father"),

    # Bar
    ("Nathan", "Black", "nathan.black@demo.com", "+1-212-555-0215",
     "Head Bartender", "waiter", "EMP-015",
     "2021-08-01", "1986-05-18", "full_time", 25.00, "Brooklyn",
     "345 Smith St, Brooklyn, NY 11231",
     "Laura Black", "+1-718-555-0315", "Spouse"),

    ("Mia", "Johnson", "mia.johnson@demo.com", "+1-212-555-0216",
     "Bartender", "waiter", "EMP-016",
     "2023-03-15", "1994-08-07", "full_time", 19.00, "Manhattan",
     "112 MacDougal St, New York, NY 10012",
     "Kevin Johnson", "+1-212-555-0316", "Brother"),

    # Cleaning
    ("Antonio", "Cruz", "antonio.cruz@demo.com", "+1-212-555-0217",
     "Dishwasher", "waiter", "EMP-017",
     "2022-10-01", "1990-04-22", "full_time", 14.00, "Bronx",
     "950 Westchester Ave, Bronx, NY 10459",
     "Carmen Cruz", "+1-718-555-0317", "Spouse"),

    ("Fatima", "Hassan", "fatima.hassan@demo.com", "+1-212-555-0218",
     "Cleaner", "waiter", "EMP-018",
     "2023-07-01", "1993-01-15", "part_time", 14.50, "Queens",
     "85-10 37th Ave, Jackson Heights, NY 11372",
     "Ahmed Hassan", "+1-718-555-0318", "Husband"),
]

# Schedule assignments: (employee_number, shift_name, weekdays) 0=Mon..6=Sun
SCHEDULE_MAP = [
    ("EMP-001", "Afternoon", [0, 1, 2, 3, 4]),          # GM: Mon-Fri
    ("EMP-002", "Evening", [1, 2, 3, 4, 5]),             # Asst Manager: Tue-Sat
    ("EMP-003", "Morning", [0, 1, 2, 3, 4]),             # Head Chef: Mon-Fri
    ("EMP-004", "Evening", [1, 2, 3, 4, 5]),             # Sous Chef: Tue-Sat
    ("EMP-005", "Morning", [0, 1, 2, 3, 4, 5]),          # Line Cook Carlos: Mon-Sat
    ("EMP-006", "Evening", [1, 2, 3, 4, 5, 6]),          # Line Cook Emily: Tue-Sun
    ("EMP-007", "Morning", [0, 1, 2, 3]),                # Prep Cook: Mon-Thu (part-time)
    ("EMP-008", "Morning", [0, 1, 2, 3, 4]),             # Pastry Chef: Mon-Fri
    ("EMP-009", "Evening", [1, 2, 3, 4, 5, 6]),          # Head Waiter: Tue-Sun
    ("EMP-010", "Evening", [0, 1, 2, 3, 4, 5]),          # Waiter Olivia: Mon-Sat
    ("EMP-011", "Evening", [3, 4, 5, 6]),                # Waiter Daniel: Thu-Sun (part-time)
    ("EMP-012", "Evening", [4, 5, 6]),                   # Waiter Isabella: Fri-Sun (part-time)
    ("EMP-013", "Evening", [4, 5, 6]),                   # Busser: Fri-Sun (part-time)
    ("EMP-014", "Afternoon", [0, 1, 2, 3, 4, 5]),       # Hostess: Mon-Sat
    ("EMP-015", "Evening", [1, 2, 3, 4, 5, 6]),          # Head Bartender: Tue-Sun
    ("EMP-016", "Evening", [3, 4, 5, 6]),                # Bartender: Thu-Sun
    ("EMP-017", "Evening", [0, 1, 2, 3, 4, 5]),          # Dishwasher: Mon-Sat
    ("EMP-018", "Morning", [0, 2, 4, 6]),                # Cleaner: Mon, Wed, Fri, Sun
]


async def seed():
    async with async_session_factory() as db:
        # 1. Get DEMO company
        result = await db.execute(select(Company).where(Company.code == "DEMO01"))
        company = result.scalar_one_or_none()
        if not company:
            print("❌ DEMO company not found. Register it first.")
            return
        cid = company.id
        print(f"✅ Found DEMO company: {company.name} ({cid})")

        # 2. Get roles
        role_result = await db.execute(select(Role).where(Role.company_id == cid))
        roles = {r.name: r.id for r in role_result.scalars().all()}
        print(f"   Roles: {list(roles.keys())}")

        # 3. Check if already seeded
        existing_pos = (await db.execute(
            select(StaffPosition).where(StaffPosition.company_id == cid)
        )).scalars().all()
        if existing_pos:
            print(f"   ⚠️  {len(existing_pos)} positions already exist. Clearing old staff data...")
            # Delete in order: schedules → profiles → users (staff) → positions, shifts
            await db.execute(text("DELETE FROM staff_schedules WHERE company_id = :cid"), {"cid": str(cid)})
            await db.execute(text("DELETE FROM staff_attendance WHERE company_id = :cid"), {"cid": str(cid)})
            
            # Get staff user IDs to delete them (but keep the admin user)
            staff_profile_result = await db.execute(
                select(StaffProfile.user_id).where(StaffProfile.company_id == cid)
            )
            staff_user_ids = [row[0] for row in staff_profile_result.all()]
            
            await db.execute(text("DELETE FROM staff_profiles WHERE company_id = :cid"), {"cid": str(cid)})
            
            # Delete staff users (not admin)
            for uid in staff_user_ids:
                await db.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": str(uid)})
                await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": str(uid)})
            
            await db.execute(text("DELETE FROM staff_positions WHERE company_id = :cid"), {"cid": str(cid)})
            await db.execute(text("DELETE FROM shifts WHERE company_id = :cid"), {"cid": str(cid)})
            await db.flush()
            print("   🗑️  Old staff data cleared.")

        # 4. Create Positions
        position_map = {}
        for pos_data in POSITIONS:
            pos = StaffPosition(company_id=cid, **pos_data)
            db.add(pos)
            await db.flush()
            position_map[pos_data["name"]] = pos.id
        print(f"✅ Created {len(POSITIONS)} positions")

        # 5. Create Shifts
        shift_map = {}
        for shift_data in SHIFTS:
            shift = Shift(company_id=cid, **shift_data)
            db.add(shift)
            await db.flush()
            shift_map[shift_data["name"]] = shift.id
        print(f"✅ Created {len(SHIFTS)} shifts")

        # 6. Create Staff Users + Profiles
        profile_map = {}  # employee_number -> profile_id
        password_hash = hash_password("staff123")  # Default password for all staff

        for member in STAFF_MEMBERS:
            (first, last, email, phone, pos_name, role_name, emp_num,
             hire, birth, contract, rate, city, addr,
             ec_name, ec_phone, ec_rel) = member

            # Create User
            user = User(
                company_id=cid,
                email=email,
                password_hash=password_hash,
                first_name=first,
                last_name=last,
                phone=phone,
                is_active=True,
            )
            db.add(user)
            await db.flush()

            # Assign role
            if role_name in roles:
                ur = UserRole(user_id=user.id, role_id=roles[role_name])
                db.add(ur)
                await db.flush()

            # Create Staff Profile
            profile = StaffProfile(
                user_id=user.id,
                company_id=cid,
                position_id=position_map.get(pos_name),
                employee_number=emp_num,
                hire_date=date.fromisoformat(hire),
                birth_date=date.fromisoformat(birth),
                contract_type=contract,
                hourly_rate=rate,
                city=city,
                address=addr,
                emergency_contact_name=ec_name,
                emergency_contact_phone=ec_phone,
                emergency_contact_relation=ec_rel,
                employment_status="active",
            )
            db.add(profile)
            await db.flush()
            profile_map[emp_num] = profile.id
            print(f"   👤 {first} {last} - {pos_name} ({emp_num})")

        print(f"✅ Created {len(STAFF_MEMBERS)} staff members")

        # 7. Create Schedules for this week + next week
        today = date.today()
        monday = today - timedelta(days=today.weekday())  # This Monday
        schedule_count = 0

        for emp_num, shift_name, weekdays in SCHEDULE_MAP:
            profile_id = profile_map.get(emp_num)
            s_id = shift_map.get(shift_name)
            if not profile_id or not s_id:
                continue
            # 2 weeks of schedules
            for week_offset in range(2):
                for wd in weekdays:
                    sched_date = monday + timedelta(days=wd + (week_offset * 7))
                    status = "completed" if sched_date < today else ("confirmed" if sched_date == today else "scheduled")
                    sched = StaffSchedule(
                        company_id=cid,
                        staff_id=profile_id,
                        shift_id=s_id,
                        date=sched_date,
                        status=status,
                    )
                    db.add(sched)
                    schedule_count += 1

        await db.flush()
        print(f"✅ Created {schedule_count} schedule entries (2 weeks)")

        await db.commit()
        print("\n🎉 Staff seeding complete!")
        print(f"   📊 {len(POSITIONS)} positions, {len(SHIFTS)} shifts, {len(STAFF_MEMBERS)} staff, {schedule_count} schedules")
        print(f"   🔑 Default staff password: staff123")


if __name__ == "__main__":
    asyncio.run(seed())
