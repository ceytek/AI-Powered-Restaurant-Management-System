"""
All database models imported here so Alembic can detect them.
"""
# Core models (Auth, Company, Users, Roles)
from app.models.core import (
    Company, User, Role, Permission, RolePermission, UserRole, RefreshToken
)

# Restaurant physical models (Tables, Sections, Hours)
from app.models.restaurant import (
    TableSection, Table, TableCombination, TableCombinationItem,
    OperatingHours, SpecialHours
)

# Menu models
from app.models.menu import (
    MenuCategory, Allergen, MenuItem, MenuItemAllergen, MenuItemVariant,
    MenuItemIngredient, MenuItemTag, PriceHistory
)

# Inventory models
from app.models.inventory import (
    InventoryCategory, UnitOfMeasure, InventoryItem, StockMovement,
    Supplier, SupplierItem, PurchaseOrder, PurchaseOrderItem
)

# Staff models
from app.models.staff import (
    StaffPosition, StaffProfile, Shift, StaffSchedule, StaffAttendance
)

# Customer models
from app.models.customer import (
    Customer, CustomerNote
)

# Reservation models
from app.models.reservation import (
    Reservation, ReservationStatusHistory, Waitlist
)

# Order models
from app.models.order import (
    Order, OrderItem, OrderItemModifier
)

# Campaign models
from app.models.campaign import (
    Campaign, CampaignUsage
)

# Audit & Notification models
from app.models.audit import (
    AuditLog, Notification
)

# AI Knowledge Base models
from app.models.knowledge import (
    KnowledgeBase, AIConversation, AIConversationMessage
)

__all__ = [
    # Core
    "Company", "User", "Role", "Permission", "RolePermission", "UserRole", "RefreshToken",
    # Restaurant
    "TableSection", "Table", "TableCombination", "TableCombinationItem",
    "OperatingHours", "SpecialHours",
    # Menu
    "MenuCategory", "Allergen", "MenuItem", "MenuItemAllergen", "MenuItemVariant",
    "MenuItemIngredient", "MenuItemTag", "PriceHistory",
    # Inventory
    "InventoryCategory", "UnitOfMeasure", "InventoryItem", "StockMovement",
    "Supplier", "SupplierItem", "PurchaseOrder", "PurchaseOrderItem",
    # Staff
    "StaffPosition", "StaffProfile", "Shift", "StaffSchedule", "StaffAttendance",
    # Customer
    "Customer", "CustomerNote",
    # Reservation
    "Reservation", "ReservationStatusHistory", "Waitlist",
    # Order
    "Order", "OrderItem", "OrderItemModifier",
    # Campaign
    "Campaign", "CampaignUsage",
    # Audit
    "AuditLog", "Notification",
    # Knowledge
    "KnowledgeBase", "AIConversation", "AIConversationMessage",
]
