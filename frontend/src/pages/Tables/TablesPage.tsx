import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableService } from '@/services/tableService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Armchair, Grid3X3, List, Loader2 } from 'lucide-react';
import type { RestaurantTable, TableSection, TableStatus } from '@/types';

const statusOptions: { value: TableStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Cleaning' },
];

const statusColorMap: Record<string, string> = {
  available: 'bg-green-500',
  occupied: 'bg-red-500',
  reserved: 'bg-blue-500',
  maintenance: 'bg-gray-400',
  cleaning: 'bg-yellow-500',
};

export function TablesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newTable, setNewTable] = useState({ table_number: '', name: '', capacity_max: 4, section_id: '', shape: 'rectangle' });
  const [newSection, setNewSection] = useState({ name: '', description: '', floor: 1, color: '#4CAF50' });

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['tables', search],
    queryFn: () => tableService.getTables({ page_size: 100, search: search || undefined }),
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
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Table status updated');
    },
  });

  const tables = tablesData?.items ?? [];
  const sections = sectionsData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Table Management"
        subtitle={`${tables.length} tables across ${sections.length} sections`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search tables..."
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

      {tablesLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
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
        /* List View */
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
              {createTableMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
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
              {createSectionMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
