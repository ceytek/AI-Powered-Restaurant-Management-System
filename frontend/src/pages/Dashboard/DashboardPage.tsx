import { useQuery } from '@tanstack/react-query';
import { dashboardService, type DashboardSummary, type StaffScheduleItem } from '@/services/dashboardService';
import { reservationService } from '@/services/reservationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Armchair, CalendarDays, Users, UtensilsCrossed,
  AlertTriangle, TrendingUp, Clock, UserCheck,
  Briefcase, UserCog, ChefHat, GlassWater,
} from 'lucide-react';
import type { ReservationBrief, ReservationStatus } from '@/types';

const statusColors: Record<ReservationStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  reminder_sent: 'bg-indigo-100 text-indigo-800',
  checked_in: 'bg-purple-100 text-purple-800',
  seated: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-orange-100 text-orange-800',
};

const deptIcons: Record<string, typeof ChefHat> = {
  kitchen: ChefHat,
  service: Users,
  bar: GlassWater,
  management: Briefcase,
  cleaning: UserCog,
};

const deptColors: Record<string, string> = {
  kitchen: 'text-red-600 bg-red-50',
  service: 'text-blue-600 bg-blue-50',
  bar: 'text-purple-600 bg-purple-50',
  management: 'text-amber-600 bg-amber-50',
  cleaning: 'text-teal-600 bg-teal-50',
};

const shiftColors: Record<string, string> = {
  Morning: 'bg-amber-100 text-amber-800',
  Afternoon: 'bg-orange-100 text-orange-800',
  Evening: 'bg-indigo-100 text-indigo-800',
  Night: 'bg-slate-200 text-slate-800',
  'Split AM': 'bg-lime-100 text-lime-800',
  'Split PM': 'bg-green-100 text-green-800',
};

export function DashboardPage() {
  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: dashboardService.getSummary,
    refetchInterval: 30000,
  });

  const { data: todayReservations } = useQuery<ReservationBrief[]>({
    queryKey: ['today-reservations'],
    queryFn: reservationService.getTodayReservations,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Tables',
      value: `${summary?.tables.available ?? 0} / ${summary?.tables.total ?? 0}`,
      subtitle: `${summary?.tables.occupancy_rate ?? 0}% occupancy`,
      icon: Armchair,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: "Today's Reservations",
      value: summary?.reservations_today.total ?? 0,
      subtitle: `${summary?.reservations_today.expected_guests ?? 0} expected guests`,
      icon: CalendarDays,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Staff on Duty',
      value: summary?.staff?.today_scheduled ?? 0,
      subtitle: `${summary?.staff?.total_active ?? 0} active total`,
      icon: UserCog,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      title: 'Customers',
      value: summary?.customers.total ?? 0,
      subtitle: `${summary?.customers.vip ?? 0} VIP`,
      icon: Users,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'Menu Items',
      value: summary?.menu.total_items ?? 0,
      subtitle: `${summary?.inventory.low_stock_alerts ?? 0} low stock alerts`,
      icon: UtensilsCrossed,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      alert: (summary?.inventory.low_stock_alerts ?? 0) > 0,
    },
  ];

  const departments = summary?.staff?.departments ?? {};
  const todayStaff = summary?.staff?.today_staff ?? [];

  // Group today's staff by shift
  const staffByShift: Record<string, StaffScheduleItem[]> = {};
  todayStaff.forEach((s) => {
    if (!staffByShift[s.shift]) staffByShift[s.shift] = [];
    staffByShift[s.shift].push(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    {stat.alert && <AlertTriangle className="h-3 w-3 text-orange-500" />}
                    {stat.subtitle}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 2: Reservations + Table Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Reservations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Today's Reservations</CardTitle>
            <Badge variant="outline" className="font-normal">
              {todayReservations?.length ?? 0} total
            </Badge>
          </CardHeader>
          <CardContent>
            {(!todayReservations || todayReservations.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CalendarDays className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No reservations for today</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {todayReservations.map((res) => (
                  <div key={res.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center min-w-[50px]">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
                        <span className="text-sm font-medium">{res.start_time.slice(0, 5)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{res.customer_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <UserCheck className="h-3 w-3" />
                          <span>{res.party_size} guests</span>
                          {res.table_number && <span>• Table {res.table_number}</span>}
                        </div>
                      </div>
                    </div>
                    <Badge className={statusColors[res.status]} variant="secondary">
                      {res.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table Status Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Table Status</CardTitle>
            <Badge variant="outline" className="font-normal">
              {summary?.tables.total ?? 0} tables
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Available', count: summary?.tables.available ?? 0, color: 'bg-green-500', total: summary?.tables.total ?? 1 },
                { label: 'Occupied', count: summary?.tables.occupied ?? 0, color: 'bg-red-500', total: summary?.tables.total ?? 1 },
                { label: 'Reserved', count: summary?.tables.reserved ?? 0, color: 'bg-blue-500', total: summary?.tables.total ?? 1 },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-500`}
                      style={{ width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {(summary?.inventory.low_stock_alerts ?? 0) > 0 && (
              <div className="mt-6 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center gap-2 text-orange-800">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {summary?.inventory.low_stock_alerts} inventory items are low on stock
                  </span>
                </div>
              </div>
            )}

            {(summary?.reservations_today.pending ?? 0) > 0 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-800">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {summary?.reservations_today.pending} pending reservations need confirmation
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Staff Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Staff by Department</CardTitle>
            <Badge variant="outline" className="font-normal">
              {summary?.staff?.total_active ?? 0} active
            </Badge>
          </CardHeader>
          <CardContent>
            {Object.keys(departments).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No staff data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(departments)
                  .sort(([, a], [, b]) => b - a)
                  .map(([dept, count]) => {
                    const DeptIcon = deptIcons[dept] ?? Users;
                    const colorClass = deptColors[dept] ?? 'text-gray-600 bg-gray-50';
                    const [textColor, bgColor] = colorClass.split(' ');
                    return (
                      <div key={dept} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${bgColor}`}>
                            <DeptIcon className={`h-4 w-4 ${textColor}`} />
                          </div>
                          <span className="text-sm font-medium capitalize">{dept}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{count}</span>
                          <span className="text-xs text-muted-foreground">staff</span>
                        </div>
                      </div>
                    );
                  })}

                {(summary?.staff?.on_leave ?? 0) > 0 && (
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {summary?.staff?.on_leave} staff member{(summary?.staff?.on_leave ?? 0) > 1 ? 's' : ''} on leave
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Staff Schedule */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Today's Staff Schedule</CardTitle>
            <Badge variant="outline" className="font-normal">
              {todayStaff.length} on duty
            </Badge>
          </CardHeader>
          <CardContent>
            {todayStaff.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No staff scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Object.entries(staffByShift).map(([shiftName, members]) => (
                  <div key={shiftName}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={shiftColors[shiftName] ?? 'bg-gray-100 text-gray-800'} variant="secondary">
                        {shiftName}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {members[0]?.shift_time}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {members.length} staff
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {members.map((staff, idx) => (
                        <div
                          key={`${staff.name}-${idx}`}
                          className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-primary">
                              {staff.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{staff.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{staff.position}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize ml-auto flex-shrink-0">
                            {staff.department}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
