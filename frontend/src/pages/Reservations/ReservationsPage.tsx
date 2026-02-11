import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reservationService } from '@/services/reservationService';
import { tableService } from '@/services/tableService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CustomerSearch } from '@/components/common/CustomerSearch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CalendarDays, Loader2, Clock, Users, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Reservation, ReservationStatus, CustomerBrief } from '@/types';

const statusFlow: Record<string, ReservationStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['seated', 'cancelled'],
  seated: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function ReservationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerBrief | null>(null);
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', customer_email: '',
    party_size: 2, date: new Date().toISOString().split('T')[0],
    start_time: '19:00', duration_minutes: 90,
    table_id: '', special_requests: '', source: 'manual',
  });

  const handleCustomerSelect = (customer: CustomerBrief) => {
    setSelectedCustomer(customer);
    setForm(prev => ({
      ...prev,
      customer_name: `${customer.first_name} ${customer.last_name || ''}`.trim(),
      customer_phone: customer.phone || '',
      customer_email: customer.email || '',
    }));
  };

  const handleCustomerClear = () => {
    setSelectedCustomer(null);
    setForm(prev => ({
      ...prev,
      customer_name: '',
      customer_phone: '',
      customer_email: '',
    }));
  };

  const { data: reservationsData, isLoading } = useQuery({
    queryKey: ['reservations', search, statusFilter],
    queryFn: () => reservationService.getReservations({
      page_size: 50, search: search || undefined,
      status: statusFilter || undefined,
    }),
  });

  const { data: tablesBrief } = useQuery({
    queryKey: ['tables-brief'],
    queryFn: () => tableService.getTablesBrief(),
  });

  const createMutation = useMutation({
    mutationFn: () => reservationService.createReservation({
      ...form, party_size: Number(form.party_size),
      duration_minutes: Number(form.duration_minutes),
      table_id: form.table_id || undefined,
      customer_email: form.customer_email || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['today-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowCreate(false);
      setSelectedCustomer(null);
      toast.success('Reservation created successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || 'Failed to create reservation';
      toast.error(message);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      reservationService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['today-reservations'] });
      toast.success('Reservation status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const reservations = reservationsData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        subtitle={`${reservationsData?.total ?? 0} reservations`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, phone, or number..."
        onAdd={() => setShowCreate(true)}
        addLabel="New Reservation"
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="seated">Seated</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading reservations...</div>
          ) : reservations.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
              <p>No reservations found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((res) => (
                  <ReservationRow
                    key={res.id}
                    reservation={res}
                    onStatusChange={(status) => statusMutation.mutate({ id: res.id, status })}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Reservation Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) { setSelectedCustomer(null); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Reservation</DialogTitle>
            <DialogDescription>Fill in the details below to create a new reservation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* Customer Search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Find Existing Customer</Label>
              <CustomerSearch
                selectedCustomer={selectedCustomer}
                onSelect={handleCustomerSelect}
                onClear={handleCustomerClear}
              />
            </div>

            {/* Customer Info Fields - editable, auto-filled when customer selected */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => setForm(p => ({ ...p, customer_name: e.target.value }))}
                  placeholder="John Smith"
                  disabled={!!selectedCustomer}
                  className={selectedCustomer ? 'bg-muted' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.customer_phone}
                  onChange={(e) => setForm(p => ({ ...p, customer_phone: e.target.value }))}
                  placeholder="+1234567890"
                  disabled={!!selectedCustomer}
                  className={selectedCustomer ? 'bg-muted' : ''}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.customer_email}
                onChange={(e) => setForm(p => ({ ...p, customer_email: e.target.value }))}
                placeholder="john@example.com"
                disabled={!!selectedCustomer}
                className={selectedCustomer ? 'bg-muted' : ''}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Party Size *</Label>
                <Input type="number" min={1} value={form.party_size} onChange={(e) => setForm(p => ({ ...p, party_size: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Select value={String(form.duration_minutes)} onValueChange={(val) => setForm(p => ({ ...p, duration_minutes: Number(val) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">60 min</SelectItem>
                    <SelectItem value="90">90 min</SelectItem>
                    <SelectItem value="120">120 min</SelectItem>
                    <SelectItem value="150">150 min</SelectItem>
                    <SelectItem value="180">180 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Table</Label>
                <Select value={form.table_id} onValueChange={(val) => setForm(p => ({ ...p, table_id: val }))}>
                  <SelectTrigger><SelectValue placeholder="Auto-assign" /></SelectTrigger>
                  <SelectContent>
                    {(tablesBrief ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.table_number} ({t.capacity_max} seats) - {t.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Special Requests</Label>
              <Textarea value={form.special_requests} onChange={(e) => setForm(p => ({ ...p, special_requests: e.target.value }))} placeholder="Birthday, window seat, etc." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.customer_name || !form.date || createMutation.isPending}>
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</>
              ) : (
                'Create Reservation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReservationRow({ reservation: res, onStatusChange }: { reservation: Reservation; onStatusChange: (status: string) => void }) {
  const nextStatuses = statusFlow[res.status] ?? [];

  return (
    <TableRow>
      <TableCell>
        <span className="font-mono text-xs">{res.reservation_number}</span>
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium text-sm">{res.customer_name}</p>
          {res.customer_phone && <p className="text-xs text-muted-foreground">{res.customer_phone}</p>}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{res.date}</span>
          <Clock className="h-3.5 w-3.5 text-muted-foreground ml-1" />
          <span>{res.start_time.slice(0, 5)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{res.party_size}</span>
        </div>
      </TableCell>
      <TableCell>{res.table_number ? `T${res.table_number}` : '-'}</TableCell>
      <TableCell><Badge variant="outline" className="text-xs capitalize">{res.source}</Badge></TableCell>
      <TableCell><StatusBadge status={res.status} /></TableCell>
      <TableCell>
        {nextStatuses.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {nextStatuses.map((s) => (
                <DropdownMenuItem key={s} onClick={() => onStatusChange(s)} className="capitalize">
                  {s === 'cancelled' ? '❌ Cancel' : s === 'no_show' ? '⚠️ No Show' : `→ ${s.replace(/_/g, ' ')}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}
