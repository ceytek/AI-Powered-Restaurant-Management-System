import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffService } from '@/services/staffService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Users, Loader2, Briefcase, Clock, CalendarDays,
  ChevronLeft, ChevronRight, Plus, Trash2,
} from 'lucide-react';
import type { StaffSchedule } from '@/types';

const departments = ['kitchen', 'service', 'management', 'bar', 'cleaning', 'delivery'];

/* ─── helpers ─── */
function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

const HOUR_START = 6;   // timeline starts at 06:00
const HOUR_END = 24;    // timeline ends at 24:00 (midnight)
const TOTAL_HOURS = HOUR_END - HOUR_START;
const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => HOUR_START + i);

/* ═══════════════════════════════════════════════════ */
export function StaffPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [showCreatePosition, setShowCreatePosition] = useState(false);
  const [showCreateShift, setShowCreateShift] = useState(false);
  const [showAssignSchedule, setShowAssignSchedule] = useState(false);
  const [activeTab, setActiveTab] = useState('staff');

  /* ─── date state for schedule ─── */
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Start from Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  });

  const dateRange = useMemo(() => {
    const days = viewMode === 'week' ? 7 : 1;
    return Array.from({ length: days }, (_, i) => addDays(selectedDate, i));
  }, [selectedDate, viewMode]);

  /* ─── form states ─── */
  const [posForm, setPosForm] = useState({
    name: '', department: 'service', description: '', base_hourly_rate: '', color: '#4CAF50',
  });
  const [shiftForm, setShiftForm] = useState({
    name: '', start_time: '09:00', end_time: '17:00', break_duration: 30, color: '#2196F3',
  });
  const [schedForm, setSchedForm] = useState({
    staff_id: '', shift_id: '', date: formatDate(new Date()), notes: '',
  });

  /* ─── queries ─── */
  const { data: positions } = useQuery({
    queryKey: ['staff-positions', departmentFilter],
    queryFn: () => staffService.getPositions(departmentFilter || undefined),
  });

  const { data: profilesData, isLoading } = useQuery({
    queryKey: ['staff-profiles', search, departmentFilter],
    queryFn: () => staffService.getProfiles({
      page_size: 50, search: search || undefined,
      department: departmentFilter || undefined,
    }),
  });

  const { data: shifts } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => staffService.getShifts(),
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['staff-schedules', formatDate(dateRange[0]), formatDate(dateRange[dateRange.length - 1])],
    queryFn: () => staffService.getSchedules({
      start_date: formatDate(dateRange[0]),
      end_date: formatDate(dateRange[dateRange.length - 1]),
    }),
    enabled: activeTab === 'schedule',
  });

  /* ─── mutations ─── */
  const createPosMutation = useMutation({
    mutationFn: () => staffService.createPosition({
      ...posForm,
      base_hourly_rate: posForm.base_hourly_rate ? Number(posForm.base_hourly_rate) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-positions'] });
      setShowCreatePosition(false);
      setPosForm({ name: '', department: 'service', description: '', base_hourly_rate: '', color: '#4CAF50' });
      toast.success('Position created');
    },
    onError: () => toast.error('Failed to create position'),
  });

  const createShiftMutation = useMutation({
    mutationFn: () => staffService.createShift(shiftForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowCreateShift(false);
      setShiftForm({ name: '', start_time: '09:00', end_time: '17:00', break_duration: 30, color: '#2196F3' });
      toast.success('Shift created');
    },
    onError: () => toast.error('Failed to create shift'),
  });

  const createSchedMutation = useMutation({
    mutationFn: () => staffService.createSchedule({
      staff_id: schedForm.staff_id,
      shift_id: schedForm.shift_id || undefined,
      date: schedForm.date,
      notes: schedForm.notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-schedules'] });
      setShowAssignSchedule(false);
      setSchedForm({ staff_id: '', shift_id: '', date: formatDate(new Date()), notes: '' });
      toast.success('Schedule assigned');
    },
    onError: () => toast.error('Failed to assign schedule'),
  });

  const deleteSchedMutation = useMutation({
    mutationFn: (id: string) => staffService.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-schedules'] });
      toast.success('Schedule removed');
    },
    onError: () => toast.error('Failed to remove schedule'),
  });

  const profiles = profilesData?.items ?? [];
  const allPositions = positions ?? [];
  const allShifts = shifts ?? [];
  const allSchedules: StaffSchedule[] = schedules ?? [];

  /* ─── Group schedules by staff for timeline ─── */
  const staffInSchedule = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dept: string; pos: string; schedules: StaffSchedule[] }>();

    // First add all active profiles so we show all staff even with no schedules
    for (const p of profiles) {
      if (p.employment_status === 'active') {
        map.set(p.id, {
          id: p.id,
          name: p.user_name || 'Unknown',
          dept: p.department || 'Other',
          pos: p.position_name || '',
          schedules: [],
        });
      }
    }

    // Then add schedules
    for (const s of allSchedules) {
      const existing = map.get(s.staff_id);
      if (existing) {
        existing.schedules.push(s);
      } else {
        // Staff not in the profiles list (maybe filtered)
        if (!map.has(s.staff_id)) {
          map.set(s.staff_id, {
            id: s.staff_id,
            name: s.staff_name || 'Unknown',
            dept: s.department || 'Other',
            pos: s.position_name || '',
            schedules: [s],
          });
        } else {
          map.get(s.staff_id)!.schedules.push(s);
        }
      }
    }

    // Group by department
    const grouped: Record<string, typeof map extends Map<string, infer V> ? V[] : never> = {};
    for (const staff of map.values()) {
      const dept = staff.dept || 'Other';
      if (!grouped[dept]) grouped[dept] = [];
      grouped[dept].push(staff);
    }

    // Sort each dept by name
    for (const dept of Object.keys(grouped)) {
      grouped[dept].sort((a, b) => a.name.localeCompare(b.name));
    }

    return grouped;
  }, [profiles, allSchedules]);

  /* ─── navigation ─── */
  const navigateDate = (dir: number) => {
    const days = viewMode === 'week' ? 7 : 1;
    setSelectedDate(addDays(selectedDate, dir * days));
  };

  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (viewMode === 'week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
    }
    setSelectedDate(d);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Management"
        subtitle={`${profilesData?.total ?? 0} staff members`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search staff..."
      >
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setShowCreatePosition(true)}>
          <Briefcase className="h-4 w-4 mr-1" /> Position
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCreateShift(true)}>
          <Clock className="h-4 w-4 mr-1" /> Shift
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="staff">Staff Members</TabsTrigger>
          <TabsTrigger value="positions">Positions ({allPositions.length})</TabsTrigger>
          <TabsTrigger value="shifts">Shifts ({allShifts.length})</TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarDays className="h-4 w-4 mr-1" />Schedule
          </TabsTrigger>
        </TabsList>

        {/* ════════════ Staff Members Tab ════════════ */}
        <TabsContent value="staff" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mb-3 opacity-30" />
                  <p>No staff profiles found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Employee #</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {(p.user_name || 'U')[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{p.user_name || 'Unknown'}</p>
                              {p.user_email && <p className="text-xs text-muted-foreground">{p.user_email}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{p.position_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{p.department || '-'}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.employee_number || '-'}</TableCell>
                        <TableCell className="capitalize text-sm">{p.contract_type}</TableCell>
                        <TableCell className="text-sm">{p.hire_date || '-'}</TableCell>
                        <TableCell><StatusBadge status={p.employment_status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════ Positions Tab ════════════ */}
        <TabsContent value="positions" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allPositions.map((pos) => (
              <Card key={pos.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: (pos.color || '#888') + '20' }}>
                        <Briefcase className="h-5 w-5" style={{ color: pos.color || '#888' }} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{pos.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{pos.department}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{pos.staff_count} staff</Badge>
                  </div>
                  {pos.description && <p className="text-xs text-muted-foreground mt-2">{pos.description}</p>}
                  {pos.base_hourly_rate && (
                    <p className="text-sm mt-2 font-medium">${pos.base_hourly_rate}/hr</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {allPositions.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground">
                <Briefcase className="h-12 w-12 mb-3 opacity-30" />
                <p>No positions defined yet</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ════════════ Shifts Tab ════════════ */}
        <TabsContent value="shifts" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allShifts.map((shift) => (
              <Card key={shift.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: (shift.color || '#2196F3') + '20' }}>
                      <Clock className="h-5 w-5" style={{ color: shift.color || '#2196F3' }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{shift.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Break: {shift.break_duration} min
                  </p>
                </CardContent>
              </Card>
            ))}
            {allShifts.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mb-3 opacity-30" />
                <p>No shifts defined yet</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ════════════ Schedule Timeline Tab ════════════ */}
        <TabsContent value="schedule" className="mt-4">
          {/* Controls */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateDate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
              <Button variant="outline" size="sm" onClick={() => navigateDate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium ml-2">
                {viewMode === 'week'
                  ? `${getDayLabel(dateRange[0])} — ${getDayLabel(dateRange[dateRange.length - 1])}`
                  : getDayLabel(dateRange[0])
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex border rounded-md overflow-hidden">
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                  onClick={() => setViewMode('day')}
                >Day</button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                  onClick={() => setViewMode('week')}
                >Week</button>
              </div>
              <Button size="sm" onClick={() => {
                setSchedForm(f => ({ ...f, date: formatDate(dateRange[0]) }));
                setShowAssignSchedule(true);
              }}>
                <Plus className="h-4 w-4 mr-1" /> Assign
              </Button>
            </div>
          </div>

          {schedulesLoading ? (
            <div className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading schedules...
            </div>
          ) : viewMode === 'day' ? (
            /* ─── DAY VIEW: Timeline ─── */
            <DayTimeline
              date={dateRange[0]}
              staffByDept={staffInSchedule}
              onDelete={(id) => deleteSchedMutation.mutate(id)}
            />
          ) : (
            /* ─── WEEK VIEW: Grid ─── */
            <WeekGrid
              days={dateRange}
              staffByDept={staffInSchedule}
              onDelete={(id) => deleteSchedMutation.mutate(id)}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════ Create Position Dialog ═══════════ */}
      <Dialog open={showCreatePosition} onOpenChange={setShowCreatePosition}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Position</DialogTitle><DialogDescription>Create a new staff position.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Position Name *</Label>
              <Input value={posForm.name} onChange={(e) => setPosForm(p => ({ ...p, name: e.target.value }))} placeholder="Head Chef" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department *</Label>
                <Select value={posForm.department} onValueChange={(val) => setPosForm(p => ({ ...p, department: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hourly Rate ($)</Label>
                <Input type="number" step="0.01" min="0" value={posForm.base_hourly_rate} onChange={(e) => setPosForm(p => ({ ...p, base_hourly_rate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={posForm.description} onChange={(e) => setPosForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input type="color" value={posForm.color} onChange={(e) => setPosForm(p => ({ ...p, color: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreatePosition(false)}>Cancel</Button>
            <Button onClick={() => createPosMutation.mutate()} disabled={!posForm.name || createPosMutation.isPending}>
              {createPosMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Create Shift Dialog ═══════════ */}
      <Dialog open={showCreateShift} onOpenChange={setShowCreateShift}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Shift</DialogTitle><DialogDescription>Define a new work shift.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Shift Name *</Label>
              <Input value={shiftForm.name} onChange={(e) => setShiftForm(p => ({ ...p, name: e.target.value }))} placeholder="Morning Shift" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time *</Label>
                <Input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time *</Label>
                <Input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm(p => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Break (min)</Label>
                <Input type="number" min="0" value={shiftForm.break_duration} onChange={(e) => setShiftForm(p => ({ ...p, break_duration: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input type="color" value={shiftForm.color} onChange={(e) => setShiftForm(p => ({ ...p, color: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateShift(false)}>Cancel</Button>
            <Button onClick={() => createShiftMutation.mutate()} disabled={!shiftForm.name || createShiftMutation.isPending}>
              {createShiftMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Assign Schedule Dialog ═══════════ */}
      <Dialog open={showAssignSchedule} onOpenChange={setShowAssignSchedule}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Schedule</DialogTitle><DialogDescription>Assign a staff member to a shift.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Staff Member *</Label>
              <Select value={schedForm.staff_id} onValueChange={(val) => setSchedForm(p => ({ ...p, staff_id: val }))}>
                <SelectTrigger><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {profiles.filter(p => p.employment_status === 'active').map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.user_name || 'Unknown'} {p.position_name ? `(${p.position_name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shift *</Label>
              <Select value={schedForm.shift_id} onValueChange={(val) => setSchedForm(p => ({ ...p, shift_id: val }))}>
                <SelectTrigger><SelectValue placeholder="Select shift..." /></SelectTrigger>
                <SelectContent>
                  {allShifts.filter(s => s.is_active).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color || '#2196F3' }} />
                        {s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={schedForm.date} onChange={(e) => setSchedForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={schedForm.notes} onChange={(e) => setSchedForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignSchedule(false)}>Cancel</Button>
            <Button
              onClick={() => createSchedMutation.mutate()}
              disabled={!schedForm.staff_id || !schedForm.shift_id || !schedForm.date || createSchedMutation.isPending}
            >
              {createSchedMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   DAY TIMELINE — Horizontal Gantt-style
   ═══════════════════════════════════════════════════════ */
interface TimelineProps {
  date: Date;
  staffByDept: Record<string, { id: string; name: string; dept: string; pos: string; schedules: StaffSchedule[] }[]>;
  onDelete: (id: string) => void;
}

function DayTimeline({ date, staffByDept, onDelete }: TimelineProps) {
  const dateStr = formatDate(date);
  const sortedDepts = Object.keys(staffByDept).sort();

  if (sortedDepts.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
        <p>No staff to display. Add staff profiles first.</p>
      </div>
    );
  }

  // Current time marker
  const now = new Date();
  const isToday = formatDate(now) === dateStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPct = Math.max(0, Math.min(100, ((nowMinutes - HOUR_START * 60) / (TOTAL_HOURS * 60)) * 100));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Hours header */}
          <div className="flex border-b bg-muted/50 sticky top-0 z-10">
            <div className="w-52 shrink-0 px-3 py-2 border-r font-medium text-xs text-muted-foreground flex items-center">
              {getDayLabel(date)}
            </div>
            <div className="flex-1 relative">
              <div className="flex">
                {HOURS.slice(0, -1).map((h) => (
                  <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground py-2 border-r border-dashed border-muted-foreground/20">
                    {h.toString().padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {/* Now marker */}
              {isToday && nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: `${nowPct}%` }}
                >
                  <div className="absolute -top-0 -left-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>

          {/* Body: departments → staff rows */}
          {sortedDepts.map((dept) => (
            <div key={dept}>
              {/* Dept header */}
              <div className="flex bg-muted/30 border-b">
                <div className="w-52 shrink-0 px-3 py-1.5 border-r">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dept}</span>
                </div>
                <div className="flex-1" />
              </div>
              {/* Staff rows */}
              {staffByDept[dept].map((staff) => {
                const daySchedules = staff.schedules.filter(s => s.date === dateStr);
                return (
                  <div key={staff.id} className="flex border-b hover:bg-muted/10 transition-colors group">
                    <div className="w-52 shrink-0 px-3 py-2 border-r flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-medium text-primary">{staff.name[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{staff.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{staff.pos}</p>
                      </div>
                    </div>
                    <div className="flex-1 relative h-12">
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {HOURS.slice(0, -1).map((h) => (
                          <div key={h} className="flex-1 border-r border-dashed border-muted-foreground/10" />
                        ))}
                      </div>
                      {/* Shift blocks */}
                      <TooltipProvider delayDuration={200}>
                        {daySchedules.map((sched) => {
                          const startTime = sched.custom_start_time || sched.shift_start_time;
                          const endTime = sched.custom_end_time || sched.shift_end_time;
                          if (!startTime || !endTime) return null;

                          const startMin = timeToMinutes(startTime);
                          const endMin = timeToMinutes(endTime);
                          const left = ((startMin - HOUR_START * 60) / (TOTAL_HOURS * 60)) * 100;
                          const width = ((endMin - startMin) / (TOTAL_HOURS * 60)) * 100;

                          if (left + width < 0 || left > 100) return null;

                          const shiftColor = sched.shift_color || '#3B82F6';

                          return (
                            <Tooltip key={sched.id}>
                              <TooltipTrigger asChild>
                                <div
                                  className="absolute top-1.5 h-9 rounded-md cursor-pointer flex items-center px-2 text-white text-[10px] font-medium shadow-sm hover:brightness-110 transition-all group/block overflow-hidden"
                                  style={{
                                    left: `${Math.max(0, left)}%`,
                                    width: `${Math.min(width, 100 - Math.max(0, left))}%`,
                                    backgroundColor: shiftColor,
                                    minWidth: '40px',
                                  }}
                                >
                                  <span className="truncate">
                                    {sched.shift_name || 'Custom'} · {startTime.slice(0, 5)}-{endTime.slice(0, 5)}
                                  </span>
                                  <button
                                    className="ml-auto opacity-0 group-hover/block:opacity-100 hover:bg-white/20 rounded p-0.5 transition-opacity shrink-0"
                                    onClick={(e) => { e.stopPropagation(); onDelete(sched.id); }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-0.5">
                                  <p className="font-semibold">{sched.shift_name || 'Custom Shift'}</p>
                                  <p>{startTime.slice(0, 5)} — {endTime.slice(0, 5)}</p>
                                  <p>Status: <span className="capitalize">{sched.status}</span></p>
                                  {sched.section_name && <p>Section: {sched.section_name}</p>}
                                  {sched.notes && <p>Notes: {sched.notes}</p>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}


/* ═══════════════════════════════════════════════════════
   WEEK GRID — 7-day overview
   ═══════════════════════════════════════════════════════ */
interface WeekGridProps {
  days: Date[];
  staffByDept: Record<string, { id: string; name: string; dept: string; pos: string; schedules: StaffSchedule[] }[]>;
  onDelete: (id: string) => void;
}

function WeekGrid({ days, staffByDept, onDelete }: WeekGridProps) {
  const sortedDepts = Object.keys(staffByDept).sort();
  const today = formatDate(new Date());

  if (sortedDepts.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
        <p>No staff to display. Add staff profiles first.</p>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="flex border-b bg-muted/50 sticky top-0 z-10">
            <div className="w-52 shrink-0 px-3 py-2 border-r font-medium text-xs text-muted-foreground">
              Staff
            </div>
            {days.map((d) => {
              const ds = formatDate(d);
              const isToday = ds === today;
              return (
                <div
                  key={ds}
                  className={`flex-1 text-center py-2 border-r text-xs font-medium ${isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className={`text-sm ${isToday ? 'font-bold' : ''}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Body: departments → staff rows */}
          {sortedDepts.map((dept) => (
            <div key={dept}>
              {/* Dept header */}
              <div className="flex bg-muted/30 border-b">
                <div className="w-52 shrink-0 px-3 py-1.5 border-r">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dept} ({staffByDept[dept].length})
                  </span>
                </div>
                {days.map((d) => <div key={formatDate(d)} className="flex-1 border-r" />)}
              </div>
              {/* Staff rows */}
              {staffByDept[dept].map((staff) => (
                <div key={staff.id} className="flex border-b hover:bg-muted/10 transition-colors">
                  <div className="w-52 shrink-0 px-3 py-2 border-r flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-medium text-primary">{staff.name[0]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{staff.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{staff.pos}</p>
                    </div>
                  </div>
                  {days.map((d) => {
                    const ds = formatDate(d);
                    const dayScheds = staff.schedules.filter(s => s.date === ds);
                    const isToday = ds === today;
                    return (
                      <div
                        key={ds}
                        className={`flex-1 border-r p-1 flex flex-col gap-0.5 ${isToday ? 'bg-primary/5' : ''}`}
                      >
                        <TooltipProvider delayDuration={200}>
                          {dayScheds.map((sched) => {
                            const startTime = sched.custom_start_time || sched.shift_start_time;
                            const endTime = sched.custom_end_time || sched.shift_end_time;
                            const color = sched.shift_color || '#3B82F6';
                            return (
                              <Tooltip key={sched.id}>
                                <TooltipTrigger asChild>
                                  <div
                                    className="rounded px-1.5 py-0.5 text-white text-[9px] font-medium truncate cursor-pointer hover:brightness-110 group/pill flex items-center gap-0.5"
                                    style={{ backgroundColor: color }}
                                  >
                                    <span className="truncate">
                                      {sched.shift_name || 'Custom'}
                                      {startTime ? ` ${startTime.slice(0, 5)}` : ''}
                                    </span>
                                    <button
                                      className="ml-auto opacity-0 group-hover/pill:opacity-100 hover:bg-white/30 rounded transition-opacity shrink-0"
                                      onClick={(e) => { e.stopPropagation(); onDelete(sched.id); }}
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs space-y-0.5">
                                    <p className="font-semibold">{sched.shift_name || 'Custom Shift'}</p>
                                    {startTime && endTime && <p>{startTime.slice(0, 5)} — {endTime.slice(0, 5)}</p>}
                                    <p>Status: <span className="capitalize">{sched.status}</span></p>
                                    {sched.section_name && <p>Section: {sched.section_name}</p>}
                                    {sched.notes && <p>Notes: {sched.notes}</p>}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </TooltipProvider>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
