import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  UtensilsCrossed,
  CalendarDays,
  Armchair,
  Package,
  Users,
  UserCircle,
  Settings,
  Mic,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    permission: 'dashboard.read',
  },
  {
    title: 'Reservations',
    href: '/reservations',
    icon: CalendarDays,
    permission: 'reservations.read',
  },
  {
    title: 'Tables',
    href: '/tables',
    icon: Armchair,
    permission: 'tables.read',
  },
  {
    title: 'Menu',
    href: '/menu',
    icon: UtensilsCrossed,
    permission: 'menu.read',
  },
  {
    title: 'Inventory',
    href: '/inventory',
    icon: Package,
    permission: 'inventory.read',
  },
  {
    title: 'Staff',
    href: '/staff',
    icon: Users,
    permission: 'staff.read',
  },
  {
    title: 'Customers',
    href: '/customers',
    icon: UserCircle,
    permission: 'customers.read',
  },
];

const bottomNavItems = [
  {
    title: 'Voice Agent',
    href: '/voice-simulator',
    icon: Mic,
    permission: 'dashboard.read',
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    permission: 'settings.read',
  },
];

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { company, hasPermission } = useAuthStore();

  const filteredNav = navItems.filter((item) => {
    const [resource, action] = item.permission.split('.');
    return hasPermission(resource, action);
  });

  const filteredBottom = bottomNavItems.filter((item) => {
    const [resource, action] = item.permission.split('.');
    return hasPermission(resource, action);
  });

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-[68px]' : 'w-[250px]'
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex-shrink-0 bg-primary rounded-lg p-1.5">
            <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold truncate text-sidebar-foreground">
                {company?.name || 'Restaurant'}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {company?.code || 'CODE'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {filteredNav.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isCollapsed && 'justify-center px-2'
                )
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.title}</span>}
            </NavLink>
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-1">
          {filteredBottom.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isCollapsed && 'justify-center px-2'
                )
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.title}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn('w-full', isCollapsed ? 'justify-center' : 'justify-start')}
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform',
              isCollapsed && 'rotate-180'
            )}
          />
          {!isCollapsed && <span className="ml-2">Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}
