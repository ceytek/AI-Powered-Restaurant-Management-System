import { useQuery } from '@tanstack/react-query';
import { dashboardService, type DashboardSummary } from '@/services/dashboardService';
import { reservationService } from '@/services/reservationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Armchair, CalendarDays, Users, UtensilsCrossed,
  AlertTriangle, TrendingUp, Clock, UserCheck,
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
