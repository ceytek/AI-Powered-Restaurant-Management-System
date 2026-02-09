import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from '@/services/customerService';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { UserCircle, Loader2, Phone, Mail, Crown, Calendar } from 'lucide-react';
import type { Customer } from '@/types';

export function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', vip_status: false,
  });

  const { data: customersData, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerService.getCustomers({
      page_size: 50, search: search || undefined,
    }),
  });

  const createMutation = useMutation({
    mutationFn: () => customerService.createCustomer(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowCreate(false);
      setForm({ first_name: '', last_name: '', email: '', phone: '', vip_status: false });
      toast.success('Customer created');
    },
    onError: () => toast.error('Failed to create customer'),
  });

  const customers = customersData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Management"
        subtitle={`${customersData?.total ?? 0} customers`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or phone..."
        onAdd={() => setShowCreate(true)}
        addLabel="Add Customer"
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <UserCircle className="h-12 w-12 mb-3 opacity-30" />
              <p>No customers found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCustomer(customer)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {customer.first_name[0]}{customer.last_name?.[0] || ''}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-sm flex items-center gap-1.5">
                            {customer.first_name} {customer.last_name || ''}
                            {customer.vip_status && <Crown className="h-3.5 w-3.5 text-yellow-500" />}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{customer.source}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {customer.phone && <p className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</p>}
                        {customer.email && <p className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell><span className="font-medium">{customer.total_visits}</span></TableCell>
                    <TableCell>${customer.total_spent}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">{customer.customer_tier}</Badge>
                    </TableCell>
                    <TableCell>
                      {customer.last_visit_date ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />{customer.last_visit_date}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {customer.is_blacklisted ? (
                        <Badge variant="destructive" className="text-xs">Blacklisted</Badge>
                      ) : customer.is_active ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Customer Detail Panel */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent className="max-w-md">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedCustomer.first_name} {selectedCustomer.last_name || ''}
                  {selectedCustomer.vip_status && <Crown className="h-4 w-4 text-yellow-500" />}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Phone" value={selectedCustomer.phone || '-'} />
                  <InfoItem label="Email" value={selectedCustomer.email || '-'} />
                  <InfoItem label="Total Visits" value={String(selectedCustomer.total_visits)} />
                  <InfoItem label="Total Spent" value={`$${selectedCustomer.total_spent}`} />
                  <InfoItem label="Avg. Spend" value={`$${selectedCustomer.average_spend}`} />
                  <InfoItem label="Tier" value={selectedCustomer.customer_tier} />
                  <InfoItem label="Loyalty Points" value={String(selectedCustomer.loyalty_points)} />
                  <InfoItem label="No-Shows" value={String(selectedCustomer.total_no_shows)} />
                  <InfoItem label="Source" value={selectedCustomer.source} />
                  <InfoItem label="Language" value={selectedCustomer.preferred_language} />
                </div>
                {selectedCustomer.dietary_preferences && selectedCustomer.dietary_preferences.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Dietary Preferences</p>
                    <div className="flex gap-1 flex-wrap">
                      {selectedCustomer.dietary_preferences.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCustomer.allergies && selectedCustomer.allergies.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Allergies</p>
                    <div className="flex gap-1 flex-wrap">
                      {selectedCustomer.allergies.map((a) => (
                        <Badge key={a} variant="destructive" className="text-xs">{a}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Customer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Customer</DialogTitle><DialogDescription>Register a new customer.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input value={form.first_name} onChange={(e) => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="John" />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={form.last_name} onChange={(e) => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1234567890" />
            </div>
            <div className="flex items-center justify-between">
              <Label>VIP Status</Label>
              <Switch checked={form.vip_status} onCheckedChange={(val) => setForm(p => ({ ...p, vip_status: val }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.first_name || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
