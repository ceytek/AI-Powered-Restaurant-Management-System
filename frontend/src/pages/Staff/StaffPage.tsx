import { useState } from 'react';
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
import { toast } from 'sonner';
import { Users, Loader2, Briefcase, Clock } from 'lucide-react';

const departments = ['kitchen', 'service', 'management', 'bar', 'cleaning', 'delivery'];

export function StaffPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [showCreatePosition, setShowCreatePosition] = useState(false);
  const [showCreateShift, setShowCreateShift] = useState(false);

  const [posForm, setPosForm] = useState({
    name: '', department: 'service', description: '', base_hourly_rate: '', color: '#4CAF50',
  });
  const [shiftForm, setShiftForm] = useState({
    name: '', start_time: '09:00', end_time: '17:00', break_duration: 30, color: '#2196F3',
  });

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

  const profiles = profilesData?.items ?? [];
  const allPositions = positions ?? [];
  const allShifts = shifts ?? [];

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

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff Members</TabsTrigger>
          <TabsTrigger value="positions">Positions ({allPositions.length})</TabsTrigger>
          <TabsTrigger value="shifts">Shifts ({allShifts.length})</TabsTrigger>
        </TabsList>

        {/* Staff Members Tab */}
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

        {/* Positions Tab */}
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

        {/* Shifts Tab */}
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
      </Tabs>

      {/* Create Position Dialog */}
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

      {/* Create Shift Dialog */}
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
    </div>
  );
}
