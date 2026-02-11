import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableService, type TableAvailability } from '@/services/tableService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Armchair,
  Grid3X3,
  List,
  Loader2,
  CalendarDays,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  AlertCircle,
  CalendarCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RestaurantTable, TableStatus } from '@/types';

const statusOptions: { value: TableStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Cleaning' },
];

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateVal = new Date(dateStr + 'T00:00:00');

  if (dateVal.getTime() === today.getTime()) return 'Today';
  if (dateVal.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getCurrentTimeRounded(): string {
  const now = new Date();
  const minutes = Math.ceil(now.getMinutes() / 30) * 30;
  now.setMinutes(minutes, 0, 0);
  if (minutes >= 60) {
    now.setHours(now.getHours() + 1, 0, 0, 0);
  }
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

export function TablesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newTable, setNewTable] = useState({ table_number: '', name: '', capacity_max: 4, section_id: '', shape: 'rectangle' });
  const [newSection, setNewSection] = useState({ name: '', description: '', floor: 1, color: '#4CAF50' });

  /* ─── Date/Time Filter ─── */
  const [filterDate, setFilterDate] = useState(formatDate(new Date()));
  const [filterTime, setFilterTime] = useState(getCurrentTimeRounded());
  const [filterEnabled, setFilterEnabled] = useState(false);

  /* ─── Regular tables query ─── */
  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['tables', search],
    queryFn: () => tableService.getTables({ page_size: 100, search: search || undefined }),
    enabled: !filterEnabled,
  });

  /* ─── Availability query (when filter is active) ─── */
  const { data: availabilityData, isLoading: availabilityLoading } = useQuery({
    queryKey: ['table-availability', filterDate, filterTime],
    queryFn: () => tableService.getTableAvailability({ date: filterDate, time: filterTime || undefined }),
    enabled: filterEnabled,
    refetchInterval: 30000, // refresh every 30s
  });

  const { data: sectionsData } = useQuery({
    queryKey: ['sections'],
    queryFn: () => tableService.getSections(),
  });

  const createTableMutation = useMutation({
    mutationFn: (data: typeof newTable) => tableService.createTable({
      ...data, capacity_max: Number(data.capacity_max),
      section_id: data.section_id || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      queryClient.invalidateQueries({ queryKey: ['table-availability'] });
      setShowCreateTable(false);
      setNewTable({ table_number: '', name: '', capacity_max: 4, section_id: '', shape: 'rectangle' });
      toast.success('Table created successfully');
    },
    onError: () => toast.error('Failed to create table'),
  });

  const createSectionMutation = useMutation({
    mutationFn: (data: typeof newSection) => tableService.createSection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      setShowCreateSection(false);
      setNewSection({ name: '', description: '', floor: 1, color: '#4CAF50' });
      toast.success('Section created successfully');
    },
    onError: () => toast.error('Failed to create section'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => tableService.updateTableStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['table-availability'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Table status updated');
    },
  });

  const sections = sectionsData?.items ?? [];
  const tables = tablesData?.items ?? [];

  const isLoading = filterEnabled ? availabilityLoading : tablesLoading;

  // Navigate date
  const shiftDate = (days: number) => {
    const d = new Date(filterDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setFilterDate(formatDate(d));
  };

  // Generate time options
  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        opts.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return opts;
  }, []);

  // Stats when filter is active
  const availabilityStats = useMemo(() => {
    if (!availabilityData) return { total: 0, reserved: 0, available: 0, totalReservations: 0 };
    const reserved = availabilityData.filter((t) => t.is_reserved_at_time).length;
    const totalRes = availabilityData.reduce((sum, t) => sum + t.reservation_count, 0);
    return {
      total: availabilityData.length,
      reserved,
      available: availabilityData.length - reserved,
      totalReservations: totalRes,
    };
  }, [availabilityData]);

  // Filter availability data by search
  const filteredAvailability = useMemo(() => {
    if (!availabilityData) return [];
    if (!search) return availabilityData;
    const s = search.toLowerCase();
    return availabilityData.filter(
      (t) =>
        t.table_number.toLowerCase().includes(s) ||
        t.name?.toLowerCase().includes(s) ||
        t.section_name?.toLowerCase().includes(s) ||
        t.reservations.some((r) => r.customer_name.toLowerCase().includes(s)),
    );
  }, [availabilityData, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Table Management"
        subtitle={`${filterEnabled ? filteredAvailability.length : tables.length} tables across ${sections.length} sections`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={filterEnabled ? 'Search tables or guests...' : 'Search tables...'}
        onAdd={() => setShowCreateTable(true)}
        addLabel="Add Table"
      >
        <Button variant="outline" size="sm" onClick={() => setShowCreateSection(true)}>
          Add Section
        </Button>
        <div className="flex border rounded-md">
          <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} className="rounded-r-none">
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="rounded-l-none">
            <List className="h-4 w-4" />
          </Button>
        </div>
      </PageHeader>

      {/* ─── Date/Time Filter Bar ─── */}
      <Card className={cn(
        'transition-all duration-300',
        filterEnabled ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20' : '',
      )}>
        <CardContent className="py-3 px-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Toggle */}
            <Button
              variant={filterEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterEnabled(!filterEnabled)}
              className={cn(
                'gap-2 shrink-0',
                filterEnabled && 'bg-emerald-600 hover:bg-emerald-700',
              )}
            >
              <CalendarCheck className="h-4 w-4" />
              {filterEnabled ? 'Filter Active' : 'Check Availability'}
            </Button>

            {/* Date navigation */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftDate(-1)}
                disabled={!filterEnabled}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="relative">
                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  disabled={!filterEnabled}
                  className="h-8 w-[160px] pl-8 text-xs"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftDate(1)}
                disabled={!filterEnabled}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="text-[11px] h-6 px-2 font-medium">
                {formatDateDisplay(filterDate)}
              </Badge>
            </div>

            {/* Time select */}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={filterTime}
                onValueChange={setFilterTime}
                disabled={!filterEnabled}
              >
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {timeOptions.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                disabled={!filterEnabled}
                onClick={() => {
                  setFilterDate(formatDate(new Date()));
                  setFilterTime(getCurrentTimeRounded());
                }}
              >
                Now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                disabled={!filterEnabled}
                onClick={() => {
                  setFilterDate(formatDate(new Date()));
                  setFilterTime('19:00');
                }}
              >
                Tonight 19:00
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                disabled={!filterEnabled}
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setFilterDate(formatDate(tomorrow));
                  setFilterTime('19:00');
                }}
              >
                Tomorrow 19:00
              </Button>
            </div>

            {/* Stats when active */}
            {filterEnabled && availabilityData && (
              <div className="ml-auto flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  {availabilityStats.available} available
                </span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  {availabilityStats.reserved} reserved
                </span>
                <span className="text-muted-foreground">
                  {availabilityStats.totalReservations} total reservations
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sections Overview */}
      {sections.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {sections.map((s) => (
            <Badge key={s.id} variant="outline" className="px-3 py-1.5">
              <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color || '#888' }} />
              {s.name} ({s.table_count} tables)
            </Badge>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : filterEnabled ? (
        /* ═══ Availability Grid View ═══ */
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredAvailability.map((table) => (
              <AvailabilityCard key={table.id} table={table} />
            ))}
            {filteredAvailability.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground">
                <Armchair className="h-12 w-12 mb-3 opacity-30" />
                <p>No tables found.</p>
              </div>
            )}
          </div>
        ) : (
          /* ═══ Availability List View ═══ */
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Status at {filterTime}</TableHead>
                    <TableHead>Reservation</TableHead>
                    <TableHead>All Reservations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAvailability.map((table) => (
                    <TableRow key={table.id} className={table.is_reserved_at_time ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                      <TableCell className="font-bold">{table.table_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {table.section_color && (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: table.section_color }} />
                          )}
                          {table.section_name || '-'}
                        </div>
                      </TableCell>
                      <TableCell>{table.capacity_min}-{table.capacity_max}</TableCell>
                      <TableCell>
                        {table.is_reserved_at_time ? (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                            Reserved
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                            Available
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {table.current_reservation ? (
                          <div className="text-xs">
                            <span className="font-medium">{table.current_reservation.customer_name}</span>
                            <span className="text-muted-foreground"> · {table.current_reservation.start_time}–{table.current_reservation.end_time}</span>
                            <span className="text-muted-foreground"> · {table.current_reservation.party_size} guests</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {table.reservation_count > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {table.reservation_count} reservation{table.reservation_count > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : viewMode === 'grid' ? (
        /* ═══ Normal Grid View ═══ */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {tables.map((table) => {
            const sectionColor = sections.find((s) => s.id === table.section_id)?.color;
            return (
              <TableCard key={table.id} table={table} sectionColor={sectionColor} onStatusChange={(status) => statusMutation.mutate({ id: table.id, status })} />
            );
          })}
          {tables.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground">
              <Armchair className="h-12 w-12 mb-3 opacity-30" />
              <p>No tables found. Add your first table!</p>
            </div>
          )}
        </div>
      ) : (
        /* ═══ Normal List View ═══ */
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Shape</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.id}>
                    <TableCell className="font-medium">{table.table_number}</TableCell>
                    <TableCell>{table.name || '-'}</TableCell>
                    <TableCell>{table.section_name || '-'}</TableCell>
                    <TableCell>{table.capacity_min}-{table.capacity_max}</TableCell>
                    <TableCell className="capitalize">{table.shape}</TableCell>
                    <TableCell><StatusBadge status={table.status} /></TableCell>
                    <TableCell>
                      <Select onValueChange={(val) => statusMutation.mutate({ id: table.id, status: val })}>
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue placeholder="Change" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Table Dialog */}
      <Dialog open={showCreateTable} onOpenChange={setShowCreateTable}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Table</DialogTitle><DialogDescription>Configure a new table for your restaurant.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Table Number *</Label>
                <Input value={newTable.table_number} onChange={(e) => setNewTable(p => ({ ...p, table_number: e.target.value }))} placeholder="T1" />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newTable.name} onChange={(e) => setNewTable(p => ({ ...p, name: e.target.value }))} placeholder="Window Table" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Capacity *</Label>
                <Input type="number" min={1} value={newTable.capacity_max} onChange={(e) => setNewTable(p => ({ ...p, capacity_max: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Shape</Label>
                <Select value={newTable.shape} onValueChange={(val) => setNewTable(p => ({ ...p, shape: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rectangle">Rectangle</SelectItem>
                    <SelectItem value="round">Round</SelectItem>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="oval">Oval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={newTable.section_id} onValueChange={(val) => setNewTable(p => ({ ...p, section_id: val }))}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTable(false)}>Cancel</Button>
            <Button onClick={() => createTableMutation.mutate(newTable)} disabled={!newTable.table_number || createTableMutation.isPending}>
              {createTableMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Section Dialog */}
      <Dialog open={showCreateSection} onOpenChange={setShowCreateSection}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Section</DialogTitle><DialogDescription>Create a new area or section in your restaurant.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Section Name *</Label>
              <Input value={newSection.name} onChange={(e) => setNewSection(p => ({ ...p, name: e.target.value }))} placeholder="Main Hall" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={newSection.description} onChange={(e) => setNewSection(p => ({ ...p, description: e.target.value }))} placeholder="Main dining area" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Floor</Label>
                <Input type="number" value={newSection.floor} onChange={(e) => setNewSection(p => ({ ...p, floor: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input type="color" value={newSection.color} onChange={(e) => setNewSection(p => ({ ...p, color: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSection(false)}>Cancel</Button>
            <Button onClick={() => createSectionMutation.mutate(newSection)} disabled={!newSection.name || createSectionMutation.isPending}>
              {createSectionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════ Normal Table Card ═══════════════ */
function TableCard({ table, sectionColor, onStatusChange }: { table: RestaurantTable; sectionColor?: string; onStatusChange: (status: string) => void }) {
  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: sectionColor || '#9CA3AF' }} />
      <CardContent className="pt-5 pb-3 px-4">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center">
            <Armchair className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-lg">{table.table_number}</p>
            {table.name && <p className="text-xs text-muted-foreground">{table.name}</p>}
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <span>{table.capacity_min}-{table.capacity_max} seats</span>
          </div>
          <StatusBadge status={table.status} className="text-[10px] px-2" />
        </div>
        {/* Quick status change on hover */}
        <div className="absolute inset-0 bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="flex flex-wrap gap-1 p-2 justify-center">
            {statusOptions.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={table.status === opt.value ? 'default' : 'outline'}
                className="text-xs h-7 px-2"
                onClick={() => onStatusChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════ Availability Table Card ═══════════════ */
function AvailabilityCard({ table }: { table: TableAvailability }) {
  const isReserved = table.is_reserved_at_time;
  const cur = table.current_reservation;
  const hasAnyReservations = table.reservation_count > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Card
        className={cn(
          'relative overflow-hidden transition-all',
          isReserved
            ? 'border-amber-300 dark:border-amber-700 shadow-amber-100 dark:shadow-amber-900/10 shadow-md'
            : hasAnyReservations
              ? 'border-blue-200 dark:border-blue-800'
              : 'hover:shadow-md',
        )}
      >
        {/* Section color bar */}
        <div
          className="absolute top-0 left-0 right-0 h-2"
          style={{ backgroundColor: table.section_color || '#9CA3AF' }}
        />

        <CardContent className="pt-5 pb-3 px-4">
          <div className="text-center space-y-2">
            {/* Table icon */}
            <div className="flex items-center justify-center">
              <div
                className={cn(
                  'p-2.5 rounded-xl transition-colors',
                  isReserved
                    ? 'bg-amber-100 dark:bg-amber-900/30'
                    : 'bg-muted/60',
                )}
              >
                <Armchair
                  className={cn(
                    'h-7 w-7',
                    isReserved
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                  )}
                />
              </div>
            </div>

            {/* Table number */}
            <div>
              <p className="font-bold text-lg">{table.table_number}</p>
              {table.name && <p className="text-[11px] text-muted-foreground">{table.name}</p>}
              {table.section_name && (
                <p className="text-[10px] text-muted-foreground/70">{table.section_name}</p>
              )}
            </div>

            {/* Capacity */}
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{table.capacity_min}–{table.capacity_max}</span>
            </div>

            {/* Status badge */}
            {isReserved ? (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700 text-[10px] px-2">
                <CalendarCheck className="h-3 w-3 mr-1" />
                Reserved
              </Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 text-[10px] px-2">
                Available
              </Badge>
            )}

            {/* Current reservation info */}
            {cur && (
              <div className="pt-1 border-t mt-2 space-y-1">
                <div className="flex items-center justify-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <User className="h-3 w-3" />
                  {cur.customer_name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {cur.start_time} – {cur.end_time} · {cur.party_size} guests
                </div>
                {cur.customer_phone && (
                  <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <Phone className="h-2.5 w-2.5" />
                    {cur.customer_phone}
                  </div>
                )}
                {cur.special_requests && (
                  <div className="flex items-center justify-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[120px]">{cur.special_requests}</span>
                  </div>
                )}
              </div>
            )}

            {/* Reservation count for the day */}
            {!isReserved && hasAnyReservations && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="pt-1 border-t mt-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-5 cursor-help"
                    >
                      <CalendarDays className="h-3 w-3 mr-1" />
                      {table.reservation_count} reservation{table.reservation_count > 1 ? 's' : ''} today
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold mb-1">Reservations for this table:</p>
                    {table.reservations.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground w-[80px]">
                          {r.start_time}–{r.end_time}
                        </span>
                        <span className="font-medium">{r.customer_name}</span>
                        <span className="text-muted-foreground">({r.party_size})</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
