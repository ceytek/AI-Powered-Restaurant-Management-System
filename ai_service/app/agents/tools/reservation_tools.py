"""Reservation tools for the AI agent - direct database operations."""
import logging
from datetime import datetime, date, time, timedelta
from typing import Optional, List
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, and_, or_
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def create_reservation_tools(db: AsyncSession, company_id: str):
    """Create reservation tools bound to a specific db session and company."""

    async def _safe_rollback():
        """Safely rollback the current transaction if needed."""
        try:
            await db.rollback()
        except Exception:
            pass

    @tool
    async def check_availability(
        reservation_date: str,
        reservation_time: str,
        party_size: int,
    ) -> str:
        """Check table availability for a given date, time and party size.

        Args:
            reservation_date: Date in YYYY-MM-DD format
            reservation_time: Time in HH:MM format (24h)
            party_size: Number of guests
        """
        try:
            target_date = datetime.strptime(reservation_date, "%Y-%m-%d").date()
            target_time = datetime.strptime(reservation_time, "%H:%M").time()
            duration = 90  # default duration minutes

            # Find tables that can accommodate the party
            tables_q = await db.execute(text("""
                SELECT t.id, t.table_number, t.capacity_max, ts.name as section_name
                FROM tables t
                LEFT JOIN table_sections ts ON ts.id = t.section_id
                WHERE t.company_id = :company_id
                  AND t.status = 'available'
                  AND t.is_active = true
                  AND t.is_reservable = true
                  AND t.capacity_max >= :party_size
                ORDER BY t.capacity_max ASC
            """), {"company_id": company_id, "party_size": party_size})
            tables = tables_q.fetchall()

            if not tables:
                return f"Sorry, we don't have any tables that can accommodate a party of {party_size}."

            # Check which tables have conflicts at the requested time
            new_start = datetime.combine(target_date, target_time)
            new_end = new_start + timedelta(minutes=duration)

            available_tables = []
            for t in tables:
                conflict_q = await db.execute(text("""
                    SELECT id, start_time, duration_minutes, customer_name
                    FROM reservations
                    WHERE company_id = :company_id
                      AND table_id = :table_id
                      AND date = :res_date
                      AND status IN ('pending', 'confirmed', 'checked_in', 'seated')
                """), {
                    "company_id": company_id,
                    "table_id": t.id,
                    "res_date": target_date,
                })
                conflicts = conflict_q.fetchall()

                has_conflict = False
                for c in conflicts:
                    ex_start = datetime.combine(target_date, c.start_time)
                    ex_end = ex_start + timedelta(minutes=c.duration_minutes or 90)
                    if ex_start < new_end and new_start < ex_end:
                        has_conflict = True
                        break

                if not has_conflict:
                    available_tables.append(t)

            if available_tables:
                table_list = ", ".join([
                    f"Table {t.table_number} ({t.section_name or 'Main'}, seats {t.capacity_max})"
                    for t in available_tables[:5]
                ])
                return f"Great news! We have {len(available_tables)} table(s) available on {reservation_date} at {reservation_time} for {party_size} guests: {table_list}"
            else:
                # Suggest alternative times
                alternatives = []
                for offset in [-60, -30, 30, 60, 120]:
                    alt_time = (new_start + timedelta(minutes=offset)).time()
                    alt_start = datetime.combine(target_date, alt_time)
                    alt_end = alt_start + timedelta(minutes=duration)

                    for t in tables[:3]:
                        conf_q = await db.execute(text("""
                            SELECT id, start_time, duration_minutes
                            FROM reservations
                            WHERE company_id = :company_id
                              AND table_id = :table_id
                              AND date = :res_date
                              AND status IN ('pending', 'confirmed', 'checked_in', 'seated')
                        """), {
                            "company_id": company_id,
                            "table_id": t.id,
                            "res_date": target_date,
                        })
                        confs = conf_q.fetchall()
                        conflict = False
                        for c in confs:
                            ex_s = datetime.combine(target_date, c.start_time)
                            ex_e = ex_s + timedelta(minutes=c.duration_minutes or 90)
                            if ex_s < alt_end and alt_start < ex_e:
                                conflict = True
                                break
                        if not conflict:
                            alternatives.append(alt_time.strftime("%H:%M"))
                            break

                if alternatives:
                    unique_alts = list(dict.fromkeys(alternatives))[:3]
                    return f"Unfortunately, {reservation_time} is fully booked on {reservation_date} for a party of {party_size}. However, we have availability at: {', '.join(unique_alts)}. Would any of those work?"
                else:
                    return f"Unfortunately, we're fully booked on {reservation_date} for a party of {party_size}. Would you like to try a different date?"

        except Exception as e:
            logger.error(f"check_availability error: {e}")
            await _safe_rollback()
            return f"I'm having trouble checking availability right now. Could you try again?"

    @tool
    async def create_reservation(
        customer_name: str,
        reservation_date: str,
        reservation_time: str,
        party_size: int,
        phone: str,
        email: Optional[str] = None,
        special_requests: Optional[str] = None,
    ) -> str:
        """Create a new reservation after customer has confirmed all details.

        Args:
            customer_name: Full name of the customer
            reservation_date: Date in YYYY-MM-DD format
            reservation_time: Time in HH:MM format (24h)
            party_size: Number of guests
            phone: Customer phone number
            email: Customer email (optional)
            special_requests: Any special requests or dietary needs (optional)
        """
        try:
            target_date = datetime.strptime(reservation_date, "%Y-%m-%d").date()
            target_time = datetime.strptime(reservation_time, "%H:%M").time()
            duration = 90

            # Find best available table
            new_start = datetime.combine(target_date, target_time)
            new_end = new_start + timedelta(minutes=duration)

            tables_q = await db.execute(text("""
                SELECT t.id, t.table_number, t.capacity_max
                FROM tables t
                WHERE t.company_id = :company_id
                  AND t.status = 'available' AND t.is_active = true AND t.is_reservable = true
                  AND t.capacity_max >= :party_size
                ORDER BY t.capacity_max ASC
            """), {"company_id": company_id, "party_size": party_size})
            tables = tables_q.fetchall()

            chosen_table = None
            for t in tables:
                conf_q = await db.execute(text("""
                    SELECT id, start_time, duration_minutes
                    FROM reservations
                    WHERE company_id = :company_id AND table_id = :table_id
                      AND date = :res_date
                      AND status IN ('pending', 'confirmed', 'checked_in', 'seated')
                """), {"company_id": company_id, "table_id": t.id, "res_date": target_date})

                has_conflict = False
                for c in conf_q.fetchall():
                    ex_s = datetime.combine(target_date, c.start_time)
                    ex_e = ex_s + timedelta(minutes=c.duration_minutes or 90)
                    if ex_s < new_end and new_start < ex_e:
                        has_conflict = True
                        break
                if not has_conflict:
                    chosen_table = t
                    break

            if not chosen_table:
                return "I'm sorry, but there are no available tables for that time. Would you like to try a different time or date?"

            # Check/create customer
            cust_q = await db.execute(text("""
                SELECT id, first_name, last_name FROM customers
                WHERE company_id = :company_id AND phone = :phone
                LIMIT 1
            """), {"company_id": company_id, "phone": phone})
            customer = cust_q.fetchone()

            customer_id = None
            if customer:
                customer_id = customer.id
            else:
                # Create new customer with all required fields
                name_parts = customer_name.strip().split(" ", 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ""
                cust_id = uuid4()
                now = datetime.utcnow()
                await db.execute(text("""
                    INSERT INTO customers (
                        id, company_id, first_name, last_name, phone, email,
                        preferred_language, vip_status, loyalty_points, customer_tier,
                        total_visits, total_spent, average_spend, total_no_shows,
                        total_cancellations, source, marketing_consent, sms_consent,
                        email_consent, is_blacklisted, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :company_id, :first_name, :last_name, :phone, :email,
                        'en', false, 0, 'regular',
                        0, 0, 0, 0,
                        0, 'ai_agent', false, false,
                        false, false, true, :now, :now
                    )
                """), {
                    "id": cust_id, "company_id": company_id,
                    "first_name": first_name, "last_name": last_name,
                    "phone": phone, "email": email or None,
                    "now": now,
                })
                customer_id = cust_id

            # Generate reservation number
            count_q = await db.execute(text(
                "SELECT COUNT(*) FROM reservations WHERE company_id = :company_id"
            ), {"company_id": company_id})
            count = count_q.scalar() or 0
            res_number = f"RES-{count + 1:05d}"

            # Create reservation
            res_id = uuid4()
            end_time = (new_start + timedelta(minutes=duration)).time()
            now = datetime.utcnow()
            await db.execute(text("""
                INSERT INTO reservations (
                    id, company_id, customer_id, customer_name, customer_phone,
                    customer_email, party_size, date, start_time, end_time, duration_minutes,
                    table_id, status, source, special_requests, reservation_number,
                    confirmation_sent, reminder_sent, created_at, updated_at
                ) VALUES (
                    :id, :company_id, :customer_id, :customer_name, :phone,
                    :email, :party_size, :res_date, :res_time, :end_time, :duration,
                    :table_id, 'confirmed', 'ai_agent', :special_requests, :res_number,
                    false, false, :now, :now
                )
            """), {
                "id": res_id, "company_id": company_id, "customer_id": customer_id,
                "customer_name": customer_name, "phone": phone,
                "email": email, "party_size": party_size,
                "res_date": target_date, "res_time": target_time, "end_time": end_time,
                "duration": duration, "table_id": chosen_table.id,
                "special_requests": special_requests, "res_number": res_number,
                "now": now,
            })

            await db.commit()

            return (
                f"Reservation confirmed! Here are the details:\n"
                f"- Confirmation number: {res_number}\n"
                f"- Name: {customer_name}\n"
                f"- Date: {reservation_date}\n"
                f"- Time: {reservation_time}\n"
                f"- Party size: {party_size}\n"
                f"- Table: {chosen_table.table_number} (seats {chosen_table.capacity_max})\n"
                f"Please arrive on time. We hold tables for 15 minutes."
            )

        except Exception as e:
            logger.error(f"create_reservation error: {e}")
            await _safe_rollback()
            return "I'm sorry, something went wrong while creating your reservation. Could you try again?"

    @tool
    async def find_reservation(query: str) -> str:
        """Find an existing reservation by customer name, phone number, or reservation number.

        Args:
            query: Customer name, phone number, or reservation number (e.g., RES-00001)
        """
        try:
            result = await db.execute(text("""
                SELECT r.reservation_number, r.customer_name, r.customer_phone,
                       r.date, r.start_time, r.party_size, r.status,
                       r.special_requests, t.table_number, r.id
                FROM reservations r
                LEFT JOIN tables t ON t.id = r.table_id
                WHERE r.company_id = :company_id
                  AND r.status NOT IN ('cancelled', 'no_show', 'completed')
                  AND (
                      r.customer_name ILIKE :query
                      OR r.customer_phone ILIKE :query
                      OR r.reservation_number ILIKE :query
                  )
                ORDER BY r.date ASC, r.start_time ASC
                LIMIT 5
            """), {"company_id": company_id, "query": f"%{query}%"})

            reservations = result.fetchall()
            if not reservations:
                return f"I couldn't find any active reservations matching '{query}'. Could you double-check the name, phone number, or confirmation number?"

            lines = []
            for r in reservations:
                lines.append(
                    f"- {r.reservation_number}: {r.customer_name}, "
                    f"{r.date.strftime('%A %B %d')} at {r.start_time.strftime('%I:%M %p')}, "
                    f"party of {r.party_size}, Table {r.table_number or 'TBD'}, "
                    f"Status: {r.status}"
                )
                if r.special_requests:
                    lines.append(f"  Special requests: {r.special_requests}")

            return f"Found {len(reservations)} reservation(s):\n" + "\n".join(lines)

        except Exception as e:
            logger.error(f"find_reservation error: {e}")
            await _safe_rollback()
            return "I'm having trouble looking that up. Could you try again?"

    @tool
    async def cancel_reservation(reservation_number: str, reason: Optional[str] = None) -> str:
        """Cancel an existing reservation by its reservation number.

        Args:
            reservation_number: The reservation confirmation number (e.g., RES-00001)
            reason: Reason for cancellation (optional)
        """
        try:
            result = await db.execute(text("""
                SELECT id, customer_name, date, start_time, party_size, status
                FROM reservations
                WHERE company_id = :company_id
                  AND reservation_number = :res_number
                LIMIT 1
            """), {"company_id": company_id, "res_number": reservation_number})

            reservation = result.fetchone()
            if not reservation:
                return f"I couldn't find reservation {reservation_number}. Could you double-check the number?"

            if reservation.status in ('cancelled', 'completed', 'no_show'):
                return f"Reservation {reservation_number} is already {reservation.status}."

            await db.execute(text("""
                UPDATE reservations
                SET status = 'cancelled', updated_at = NOW(),
                    cancellation_reason = :cancel_reason,
                    cancelled_at = NOW()
                WHERE id = :res_id AND company_id = :company_id
            """), {
                "res_id": reservation.id,
                "company_id": company_id,
                "cancel_reason": f"Cancelled via AI agent{': ' + reason if reason else ''}",
            })
            await db.commit()

            return (
                f"Reservation {reservation_number} has been cancelled.\n"
                f"- Name: {reservation.customer_name}\n"
                f"- Was for: {reservation.date.strftime('%A %B %d')} at {reservation.start_time.strftime('%I:%M %p')}, party of {reservation.party_size}\n"
                f"The table is now available for other guests."
            )

        except Exception as e:
            logger.error(f"cancel_reservation error: {e}")
            await _safe_rollback()
            return "I'm sorry, something went wrong while cancelling. Could you try again?"

    @tool
    async def get_upcoming_reservations(phone: str) -> str:
        """Get all upcoming reservations for a customer by phone number.

        Args:
            phone: Customer phone number
        """
        try:
            today = datetime.now().date()
            result = await db.execute(text("""
                SELECT r.reservation_number, r.customer_name, r.date, r.start_time,
                       r.party_size, r.status, t.table_number
                FROM reservations r
                LEFT JOIN tables t ON t.id = r.table_id
                WHERE r.company_id = :company_id
                  AND r.customer_phone ILIKE :phone
                  AND r.date >= :today
                  AND r.status NOT IN ('cancelled', 'no_show', 'completed')
                ORDER BY r.date ASC, r.start_time ASC
            """), {"company_id": company_id, "phone": f"%{phone}%", "today": today})

            reservations = result.fetchall()
            if not reservations:
                return f"No upcoming reservations found for phone number {phone}."

            lines = []
            for r in reservations:
                lines.append(
                    f"- {r.reservation_number}: {r.date.strftime('%A %B %d')} at "
                    f"{r.start_time.strftime('%I:%M %p')}, party of {r.party_size}, "
                    f"Table {r.table_number or 'TBD'} ({r.status})"
                )

            return f"Upcoming reservations for {phone}:\n" + "\n".join(lines)

        except Exception as e:
            logger.error(f"get_upcoming_reservations error: {e}")
            await _safe_rollback()
            return "I'm having trouble looking that up right now."

    return [check_availability, create_reservation, find_reservation, cancel_reservation, get_upcoming_reservations]
