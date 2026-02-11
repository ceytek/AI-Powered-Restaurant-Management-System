import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  dashboardService,
  type DashboardSummary,
  type StaffScheduleItem,
} from '@/services/dashboardService';
import { reservationService } from '@/services/reservationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Armchair, CalendarDays, Users,
  AlertTriangle, TrendingUp, Clock, UserCheck,
  Briefcase, UserCog, ChefHat, GlassWater,
  Package, DollarSign, Trash2, ArrowUpCircle,
  ArrowDownCircle, AlertCircle,
  BarChart3, ExternalLink, RefreshCw, Box,
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

const movementIcons: Record<string, typeof ArrowUpCircle> = {
  purchase: ArrowDownCircle,
  usage: ArrowUpCircle,
  waste: Trash2,
  adjustment: RefreshCw,
  initial: Package,
  return: ArrowDownCircle,
  transfer: RefreshCw,
};

const movementColors: Record<string, string> = {
  purchase: 'text-green-600 bg-green-50',
  usage: 'text-blue-600 bg-blue-50',
  waste: 'text-red-600 bg-red-50',
  adjustment: 'text-amber-600 bg-amber-50',
  initial: 'text-gray-600 bg-gray-50',
  return: 'text-teal-600 bg-teal-50',
  transfer: 'text-indigo-600 bg-indigo-50',
};

const severityConfig = {
  critical: { color: 'bg-red-100 text-red-800 border-red-200', barColor: 'bg-red-500', icon: AlertCircle },
  warning: { color: 'bg-orange-100 text-orange-800 border-orange-200', barColor: 'bg-orange-500', icon: AlertTriangle },
  low: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', barColor: 'bg-yellow-500', icon: AlertTriangle },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function DashboardPage() {
  const navigate = useNavigate();

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="pt-6"><Skeleton className="h-60 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-60 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const lowStockItems = summary?.inventory.low_stock_items ?? [];
  const criticalCount = lowStockItems.filter(i => i.severity === 'critical').length;
  const warningCount = lowStockItems.filter(i => i.severity === 'warning').length;
  const categoryBreakdown = summary?.inventory.category_breakdown ?? [];
  const recentMovements = summary?.inventory.recent_movements ?? [];

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
      title: 'Inventory',
      value: summary?.inventory.total_items ?? 0,
      subtitle: `${formatCurrency(summary?.inventory.total_value ?? 0)} total value`,
      icon: Package,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      alert: (summary?.inventory.low_stock_alerts ?? 0) > 0,
      alertText: `${summary?.inventory.low_stock_alerts ?? 0} low stock`,
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

      {/* ==================== Critical Alerts Banner ==================== */}
      {(criticalCount > 0 || (summary?.inventory.out_of_stock ?? 0) > 0) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-4 animate-pulse-slow">
          <div className="p-3 bg-red-100 rounded-lg">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800">Critical Inventory Alert</h3>
            <p className="text-xs text-red-700 mt-0.5">
              {(summary?.inventory.out_of_stock ?? 0) > 0 && (
                <span className="font-semibold">{summary?.inventory.out_of_stock} item{(summary?.inventory.out_of_stock ?? 0) > 1 ? 's' : ''} out of stock. </span>
              )}
              {criticalCount > 0 && (
                <span>{criticalCount} item{criticalCount > 1 ? 's' : ''} critically low — immediate reorder needed.</span>
              )}
            </p>
          </div>
          <Button size="sm" variant="destructive" onClick={() => navigate('/inventory')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Inventory
          </Button>
        </div>
      )}

      {/* ==================== Stats Cards ==================== */}
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
                    {stat.alertText ? stat.alertText : stat.subtitle}
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

      {/* ==================== Inventory Alerts Section ==================== */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">Low Stock Alerts</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {criticalCount > 0 && <span className="text-red-600 font-medium">{criticalCount} critical</span>}
                  {criticalCount > 0 && warningCount > 0 && <span> · </span>}
                  {warningCount > 0 && <span className="text-orange-600 font-medium">{warningCount} warning</span>}
                  {(criticalCount > 0 || warningCount > 0) && lowStockItems.length > criticalCount + warningCount && <span> · </span>}
                  {lowStockItems.length > criticalCount + warningCount && (
                    <span className="text-yellow-600 font-medium">{lowStockItems.length - criticalCount - warningCount} low</span>
                  )}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/inventory')}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage Inventory
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock Level</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Minimum</TableHead>
                    <TableHead>Reorder Qty</TableHead>
                    <TableHead>Value at Risk</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((item) => {
                    const config = severityConfig[item.severity];
                    const SeverityIcon = config.icon;
                    const valueAtRisk = (item.minimum_stock - item.current_stock) * item.unit_cost;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="pr-0">
                          <SeverityIcon className={`h-4 w-4 ${item.severity === 'critical' ? 'text-red-500' : item.severity === 'warning' ? 'text-orange-500' : 'text-yellow-500'}`} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.sku && <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-normal">{item.category || '—'}</Badge>
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-semibold ${item.severity === 'critical' ? 'text-red-600' : item.severity === 'warning' ? 'text-orange-600' : 'text-yellow-600'}`}>
                                {item.stock_percentage}%
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${config.barColor}`}
                                style={{ width: `${Math.min(item.stock_percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`font-semibold ${item.severity === 'critical' ? 'text-red-600' : ''}`}>
                            {item.current_stock} {item.unit || ''}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{item.minimum_stock} {item.unit || ''}</span>
                        </TableCell>
                        <TableCell>
                          {item.reorder_quantity ? (
                            <span className="text-sm">{item.reorder_quantity} {item.unit || ''}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not set</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-red-600">
                            {formatCurrency(valueAtRisk > 0 ? valueAtRisk : 0)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{item.storage_location || '—'}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ==================== Row 2: Reservations + Table Status ==================== */}
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

            {(summary?.reservations_today.pending ?? 0) > 0 && (
              <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
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

      {/* ==================== Row 3: Inventory Overview ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory Summary Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Inventory Summary</CardTitle>
            <div className="p-2 bg-teal-50 rounded-lg">
              <BarChart3 className="h-4 w-4 text-teal-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total Items</span>
                  </div>
                  <p className="text-xl font-bold">{summary?.inventory.total_items ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total Value</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(summary?.inventory.total_value ?? 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs text-orange-700">Low Stock</span>
                  </div>
                  <p className="text-xl font-bold text-orange-700">{summary?.inventory.low_stock_alerts ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs text-red-700">Waste (7d)</span>
                  </div>
                  <p className="text-xl font-bold text-red-700">{formatCurrency(summary?.inventory.waste_last_7_days ?? 0)}</p>
                </div>
              </div>

              {/* Category breakdown */}
              {categoryBreakdown.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">By Category</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {categoryBreakdown.map((cat) => (
                      <div key={cat.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Box className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{cat.name}</span>
                          {cat.low_stock_count > 0 && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1">
                              {cat.low_stock_count}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{cat.item_count} items</span>
                          <span className="text-xs font-medium w-16 text-right">{formatCurrency(cat.total_value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Stock Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold">Recent Stock Activity</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate('/inventory')}>
              View All <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No recent stock activity</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recentMovements.map((m) => {
                  const MoveIcon = movementIcons[m.movement_type] ?? RefreshCw;
                  const colorClass = movementColors[m.movement_type] ?? 'text-gray-600 bg-gray-50';
                  const [textColor, bgColor] = colorClass.split(' ');
                  const isPositive = m.quantity > 0;

                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div className={`p-2 rounded-lg ${bgColor}`}>
                        <MoveIcon className={`h-4 w-4 ${textColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{m.item_name}</p>
                          <Badge variant="outline" className={`text-[10px] capitalize ${colorClass}`}>
                            {m.movement_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {m.performed_by && <span>{m.performed_by}</span>}
                          <span>•</span>
                          <span>{timeAgo(m.performed_at)}</span>
                          {m.notes && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[150px]">{m.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {isPositive ? '+' : ''}{m.quantity}
                        </p>
                        {m.total_cost != null && (
                          <p className="text-xs text-muted-foreground">{formatCurrency(m.total_cost)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ==================== Row 4: Staff Section ==================== */}
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
