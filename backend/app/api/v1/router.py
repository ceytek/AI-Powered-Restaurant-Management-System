from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.tables import router as tables_router
from app.api.v1.menu import router as menu_router
from app.api.v1.inventory import router as inventory_router
from app.api.v1.staff import router as staff_router
from app.api.v1.reservations import router as reservations_router
from app.api.v1.customers import router as customers_router

api_router = APIRouter(prefix="/api/v1")

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(tables_router, prefix="/tables", tags=["Tables"])
api_router.include_router(menu_router, prefix="/menu", tags=["Menu"])
api_router.include_router(inventory_router, prefix="/inventory", tags=["Inventory"])
api_router.include_router(staff_router, prefix="/staff", tags=["Staff"])
api_router.include_router(reservations_router, prefix="/reservations", tags=["Reservations"])
api_router.include_router(customers_router, prefix="/customers", tags=["Customers"])
