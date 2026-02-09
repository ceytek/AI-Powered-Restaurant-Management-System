import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '@/services/inventoryService';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Package, Loader2, AlertTriangle, ArrowDownCircle, ArrowUpCircle, FolderPlus, TrendingDown } from 'lucide-react';
import type { InventoryItem, StockMovement } from '@/types';

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [itemForm, setItemForm] = useState({
    name: '', description: '', category_id: '', sku: '',
    current_stock: '', minimum_stock: '', unit_cost: '',
    storage_location: '',
  });
  const [movementForm, setMovementForm] = useState({
    inventory_item_id: '', movement_type: 'purchase', quantity: '', unit_cost: '', notes: '',
  });
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  const { data: categories } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => inventoryService.getCategories(),
  });

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['inventory-items', search, categoryFilter, showLowStock],
    queryFn: () => inventoryService.getItems({
      page_size: 50, search: search || undefined,
      category_id: categoryFilter || undefined,
      low_stock: showLowStock || undefined,
    }),
  });

  const { data: movementsData } = useQuery({
    queryKey: ['stock-movements'],
    queryFn: () => inventoryService.getMovements({ page_size: 20 }),
  });

  const createItemMutation = useMutation({
    mutationFn: () => inventoryService.createItem({
      ...itemForm,
      current_stock: itemForm.current_stock ? Number(itemForm.current_stock) : undefined,
      minimum_stock: itemForm.minimum_stock ? Number(itemForm.minimum_stock) : undefined,
      unit_cost: itemForm.unit_cost ? Number(itemForm.unit_cost) : undefined,
      category_id: itemForm.category_id || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setShowCreate(false);
      setItemForm({ name: '', description: '', category_id: '', sku: '', current_stock: '', minimum_stock: '', unit_cost: '', storage_location: '' });
      toast.success('Inventory item created');
    },
    onError: () => toast.error('Failed to create item'),
  });

  const createMovementMutation = useMutation({
    mutationFn: () => inventoryService.createMovement({
      ...movementForm,
      quantity: Number(movementForm.quantity),
      unit_cost: movementForm.unit_cost ? Number(movementForm.unit_cost) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowMovement(false);
      setMovementForm({ inventory_item_id: '', movement_type: 'purchase', quantity: '', unit_cost: '', notes: '' });
      toast.success('Stock movement recorded');
    },
    onError: () => toast.error('Failed to record movement'),
  });

  const createCatMutation = useMutation({
    mutationFn: () => inventoryService.createCategory(catForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      setShowCreateCategory(false);
      setCatForm({ name: '', description: '' });
      toast.success('Category created');
    },
    onError: () => toast.error('Failed to create category'),
  });

  const items = itemsData?.items ?? [];
  const allCategories = categories ?? [];
  const movements = movementsData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        subtitle={`${itemsData?.total ?? 0} items`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search inventory..."
        onAdd={() => setShowCreate(true)}
        addLabel="Add Item"
      >
        <Button variant="outline" size="sm" onClick={() => setShowCreateCategory(true)}>
          <FolderPlus className="h-4 w-4 mr-1" /> Category
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowMovement(true)}>
          <ArrowUpCircle className="h-4 w-4 mr-1" /> Stock Movement
        </Button>
        <Button
          variant={showLowStock ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowLowStock(!showLowStock)}
        >
          <AlertTriangle className="h-4 w-4 mr-1" /> Low Stock
        </Button>
      </PageHeader>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Inventory Items</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-30" />
                  <p>No inventory items found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Min Stock</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <p className="font-medium text-sm">{item.name}</p>
                          {item.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>}
                        </TableCell>
                        <TableCell>{item.category_name || '-'}</TableCell>
                        <TableCell><span className="font-mono text-xs">{item.sku || '-'}</span></TableCell>
                        <TableCell>
                          <span className={`font-medium ${item.is_low_stock ? 'text-red-600' : ''}`}>
                            {item.current_stock} {item.unit_abbreviation || ''}
                          </span>
                        </TableCell>
                        <TableCell>{item.minimum_stock} {item.unit_abbreviation || ''}</TableCell>
                        <TableCell>${item.unit_cost}</TableCell>
                        <TableCell>{item.storage_location || '-'}</TableCell>
                        <TableCell>
                          {item.is_low_stock ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Low
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <TrendingDown className="h-12 w-12 mb-3 opacity-30" />
                  <p>No stock movements recorded</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Stock After</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs">{new Date(m.performed_at).toLocaleString()}</TableCell>
                        <TableCell className="font-medium text-sm">{m.inventory_item_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs capitalize ${
                            m.movement_type === 'purchase' ? 'bg-green-50 text-green-700' :
                            m.movement_type === 'usage' ? 'bg-blue-50 text-blue-700' :
                            m.movement_type === 'waste' ? 'bg-red-50 text-red-700' :
                            'bg-gray-50'
                          }`}>
                            {m.movement_type === 'purchase' && <ArrowDownCircle className="h-3 w-3 mr-1" />}
                            {m.movement_type === 'usage' && <ArrowUpCircle className="h-3 w-3 mr-1" />}
                            {m.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{m.quantity}</TableCell>
                        <TableCell>{m.unit_cost ? `$${m.unit_cost}` : '-'}</TableCell>
                        <TableCell>{m.stock_after ?? '-'}</TableCell>
                        <TableCell className="text-xs">{m.performed_by_name || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{m.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Item Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Olive Oil" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={itemForm.description} onChange={(e) => setItemForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm(p => ({ ...p, sku: e.target.value }))} placeholder="OIL-001" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={itemForm.category_id} onValueChange={(val) => setItemForm(p => ({ ...p, category_id: val }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input type="number" min="0" value={itemForm.current_stock} onChange={(e) => setItemForm(p => ({ ...p, current_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Min Stock</Label>
                <Input type="number" min="0" value={itemForm.minimum_stock} onChange={(e) => setItemForm(p => ({ ...p, minimum_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" min="0" value={itemForm.unit_cost} onChange={(e) => setItemForm(p => ({ ...p, unit_cost: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Storage Location</Label>
              <Input value={itemForm.storage_location} onChange={(e) => setItemForm(p => ({ ...p, storage_location: e.target.value }))} placeholder="Walk-in Cooler" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createItemMutation.mutate()} disabled={!itemForm.name || createItemMutation.isPending}>
              {createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Movement Dialog */}
      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Stock Movement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={movementForm.inventory_item_id} onValueChange={(val) => setMovementForm(p => ({ ...p, inventory_item_id: val }))}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name} (Stock: {item.current_stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={movementForm.movement_type} onValueChange={(val) => setMovementForm(p => ({ ...p, movement_type: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Purchase (In)</SelectItem>
                    <SelectItem value="usage">Usage (Out)</SelectItem>
                    <SelectItem value="waste">Waste</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                    <SelectItem value="return">Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" min="0" value={movementForm.quantity} onChange={(e) => setMovementForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unit Cost ($)</Label>
              <Input type="number" step="0.01" min="0" value={movementForm.unit_cost} onChange={(e) => setMovementForm(p => ({ ...p, unit_cost: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={movementForm.notes} onChange={(e) => setMovementForm(p => ({ ...p, notes: e.target.value }))} placeholder="Weekly order from supplier" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovement(false)}>Cancel</Button>
            <Button onClick={() => createMovementMutation.mutate()} disabled={!movementForm.inventory_item_id || !movementForm.quantity || createMovementMutation.isPending}>
              {createMovementMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Record Movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Inventory Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Oils & Sauces" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={catForm.description} onChange={(e) => setCatForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateCategory(false)}>Cancel</Button>
            <Button onClick={() => createCatMutation.mutate()} disabled={!catForm.name || createCatMutation.isPending}>
              {createCatMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
