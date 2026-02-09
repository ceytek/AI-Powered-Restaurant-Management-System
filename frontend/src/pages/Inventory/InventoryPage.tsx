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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Package, Loader2, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  FolderPlus, TrendingDown, DollarSign, Box, Truck, RefreshCw,
  Trash2, Eye, Edit, AlertCircle, BarChart3, ShoppingCart,
} from 'lucide-react';
import type { InventoryItem, InventoryCategory, StockMovement, Supplier } from '@/types';

const movementTypeConfig: Record<string, { label: string; color: string; icon: typeof ArrowDownCircle }> = {
  purchase: { label: 'Purchase (In)', color: 'bg-green-50 text-green-700', icon: ArrowDownCircle },
  usage: { label: 'Usage (Out)', color: 'bg-blue-50 text-blue-700', icon: ArrowUpCircle },
  waste: { label: 'Waste', color: 'bg-red-50 text-red-700', icon: Trash2 },
  adjustment: { label: 'Adjustment', color: 'bg-amber-50 text-amber-700', icon: RefreshCw },
  return: { label: 'Return', color: 'bg-teal-50 text-teal-700', icon: ArrowDownCircle },
  transfer: { label: 'Transfer', color: 'bg-indigo-50 text-indigo-700', icon: RefreshCw },
  initial: { label: 'Initial Stock', color: 'bg-gray-50 text-gray-700', icon: Package },
};

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showDetail, setShowDetail] = useState<InventoryItem | null>(null);
  const [showEditItem, setShowEditItem] = useState<InventoryItem | null>(null);
  const [activeTab, setActiveTab] = useState('items');
  const [movementFilter, setMovementFilter] = useState<string>('');

  const [itemForm, setItemForm] = useState({
    name: '', description: '', category_id: '', sku: '',
    current_stock: '', minimum_stock: '', maximum_stock: '',
    reorder_point: '', reorder_quantity: '',
    unit_cost: '', storage_location: '', storage_temperature: '',
    expiry_tracking: false,
  });
  const [editForm, setEditForm] = useState({
    name: '', description: '', category_id: '', sku: '',
    minimum_stock: '', maximum_stock: '',
    reorder_point: '', reorder_quantity: '',
    unit_cost: '', storage_location: '', storage_temperature: '',
  });
  const [movementForm, setMovementForm] = useState({
    inventory_item_id: '', movement_type: 'purchase', quantity: '', unit_cost: '', notes: '',
  });
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  // ==================== Queries ====================
  const { data: categories } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: () => inventoryService.getCategories(),
  });

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['inventory-items', search, categoryFilter, showLowStock],
    queryFn: () => inventoryService.getItems({
      page_size: 100, search: search || undefined,
      category_id: categoryFilter || undefined,
      low_stock: showLowStock || undefined,
    }),
  });

  const { data: movementsData } = useQuery({
    queryKey: ['stock-movements', movementFilter],
    queryFn: () => inventoryService.getMovements({
      page_size: 50,
      movement_type: movementFilter || undefined,
    }),
    enabled: activeTab === 'movements',
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => inventoryService.getSuppliers({ page_size: 50 }),
    enabled: activeTab === 'suppliers',
  });

  // ==================== Mutations ====================
  const createItemMutation = useMutation({
    mutationFn: () => inventoryService.createItem({
      ...itemForm,
      current_stock: itemForm.current_stock ? Number(itemForm.current_stock) : undefined,
      minimum_stock: itemForm.minimum_stock ? Number(itemForm.minimum_stock) : undefined,
      maximum_stock: itemForm.maximum_stock ? Number(itemForm.maximum_stock) : undefined,
      reorder_point: itemForm.reorder_point ? Number(itemForm.reorder_point) : undefined,
      reorder_quantity: itemForm.reorder_quantity ? Number(itemForm.reorder_quantity) : undefined,
      unit_cost: itemForm.unit_cost ? Number(itemForm.unit_cost) : undefined,
      category_id: itemForm.category_id || undefined,
      expiry_tracking: itemForm.expiry_tracking,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowCreate(false);
      resetItemForm();
      toast.success('Inventory item created');
    },
    onError: () => toast.error('Failed to create item'),
  });

  const updateItemMutation = useMutation({
    mutationFn: () => {
      if (!showEditItem) return Promise.reject('No item');
      return inventoryService.updateItem(showEditItem.id, {
        name: editForm.name || undefined,
        description: editForm.description || undefined,
        category_id: editForm.category_id || undefined,
        sku: editForm.sku || undefined,
        minimum_stock: editForm.minimum_stock ? Number(editForm.minimum_stock) : undefined,
        maximum_stock: editForm.maximum_stock ? Number(editForm.maximum_stock) : undefined,
        reorder_point: editForm.reorder_point ? Number(editForm.reorder_point) : undefined,
        reorder_quantity: editForm.reorder_quantity ? Number(editForm.reorder_quantity) : undefined,
        unit_cost: editForm.unit_cost ? Number(editForm.unit_cost) : undefined,
        storage_location: editForm.storage_location || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowEditItem(null);
      toast.success('Item updated successfully');
    },
    onError: () => toast.error('Failed to update item'),
  });

  const createMovementMutation = useMutation({
    mutationFn: () => {
      const qty = Number(movementForm.quantity);
      const isOutgoing = ['usage', 'waste'].includes(movementForm.movement_type);
      return inventoryService.createMovement({
        ...movementForm,
        quantity: isOutgoing ? -Math.abs(qty) : Math.abs(qty),
        unit_cost: movementForm.unit_cost ? Number(movementForm.unit_cost) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowMovement(false);
      setMovementForm({ inventory_item_id: '', movement_type: 'purchase', quantity: '', unit_cost: '', notes: '' });
      toast.success('Stock movement recorded');
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || 'Failed to record movement';
      toast.error(detail);
    },
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
  const suppliers = suppliersData?.items ?? [];

  // Stats
  const totalItems = itemsData?.total ?? 0;
  const lowStockItems = items.filter(i => i.is_low_stock);
  const totalValue = items.reduce((sum, i) => sum + Number(i.current_stock) * Number(i.unit_cost), 0);

  function resetItemForm() {
    setItemForm({
      name: '', description: '', category_id: '', sku: '',
      current_stock: '', minimum_stock: '', maximum_stock: '',
      reorder_point: '', reorder_quantity: '',
      unit_cost: '', storage_location: '', storage_temperature: '',
      expiry_tracking: false,
    });
  }

  function openEditDialog(item: InventoryItem) {
    setEditForm({
      name: item.name,
      description: item.description || '',
      category_id: item.category_id || '',
      sku: item.sku || '',
      minimum_stock: String(item.minimum_stock),
      maximum_stock: item.maximum_stock ? String(item.maximum_stock) : '',
      reorder_point: item.reorder_point ? String(item.reorder_point) : '',
      reorder_quantity: item.reorder_quantity ? String(item.reorder_quantity) : '',
      unit_cost: String(item.unit_cost),
      storage_location: item.storage_location || '',
      storage_temperature: item.storage_temperature || '',
    });
    setShowEditItem(item);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        subtitle={`${totalItems} items · ${formatCurrency(totalValue)} total value`}
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
          className={showLowStock ? '' : lowStockItems.length > 0 ? 'border-orange-300 text-orange-700 hover:bg-orange-50' : ''}
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Low Stock{lowStockItems.length > 0 && !showLowStock ? ` (${lowStockItems.length})` : ''}
        </Button>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-2xl font-bold">{totalItems}</p>
            </div>
            <Package className="h-8 w-8 text-teal-500 opacity-40" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500 opacity-40" />
          </CardContent>
        </Card>
        <Card className={lowStockItems.length > 0 ? 'border-orange-200' : ''}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Low Stock Items</p>
              <p className={`text-2xl font-bold ${lowStockItems.length > 0 ? 'text-orange-600' : ''}`}>
                {lowStockItems.length}
              </p>
            </div>
            <AlertTriangle className={`h-8 w-8 opacity-40 ${lowStockItems.length > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Categories</p>
              <p className="text-2xl font-bold">{allCategories.length}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-blue-500 opacity-40" />
          </CardContent>
        </Card>
      </div>

      {/* Category Filter Chips */}
      {allCategories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={categoryFilter === '' ? 'default' : 'outline'}
            className="cursor-pointer px-3 py-1.5"
            onClick={() => setCategoryFilter('')}
          >
            All ({totalItems})
          </Badge>
          {allCategories.map((cat) => (
            <Badge
              key={cat.id}
              variant={categoryFilter === cat.id ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1.5"
              onClick={() => setCategoryFilter(cat.id === categoryFilter ? '' : cat.id)}
            >
              {cat.name} ({cat.item_count || 0})
            </Badge>
          ))}
        </div>
      )}

      <Tabs defaultValue="items" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items">
            <Package className="h-3.5 w-3.5 mr-1.5" /> Inventory Items
          </TabsTrigger>
          <TabsTrigger value="movements">
            <TrendingDown className="h-3.5 w-3.5 mr-1.5" /> Stock Movements
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <Truck className="h-3.5 w-3.5 mr-1.5" /> Suppliers
          </TabsTrigger>
        </TabsList>

        {/* ==================== Items Tab ==================== */}
        <TabsContent value="items" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-30" />
                  <p>No inventory items found</p>
                  {showLowStock && <p className="text-xs mt-1">Try removing the low stock filter</p>}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]"></TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Min / Max</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const stockPct = item.minimum_stock > 0
                        ? Math.round(Number(item.current_stock) / Number(item.minimum_stock) * 100)
                        : 100;
                      const isCritical = stockPct <= 25;
                      const isWarning = stockPct <= 60 && !isCritical;
                      const itemValue = Number(item.current_stock) * Number(item.unit_cost);

                      return (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="pr-0">
                            {item.is_low_stock ? (
                              isCritical ? (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                              )
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-normal">{item.category_name || '—'}</Badge>
                          </TableCell>
                          <TableCell><span className="font-mono text-xs">{item.sku || '—'}</span></TableCell>
                          <TableCell>
                            <div>
                              <span className={`font-semibold text-sm ${item.is_low_stock ? (isCritical ? 'text-red-600' : 'text-orange-600') : ''}`}>
                                {Number(item.current_stock).toFixed(1)} {item.unit_abbreviation || ''}
                              </span>
                              {item.is_low_stock && (
                                <div className="mt-1 h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${isCritical ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-yellow-500'}`}
                                    style={{ width: `${Math.min(stockPct, 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {Number(item.minimum_stock).toFixed(0)} / {item.maximum_stock ? Number(item.maximum_stock).toFixed(0) : '—'}
                            </span>
                          </TableCell>
                          <TableCell>{formatCurrency(Number(item.unit_cost))}</TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">{formatCurrency(itemValue)}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{item.storage_location || '—'}</span>
                          </TableCell>
                          <TableCell>
                            {item.is_low_stock ? (
                              isCritical ? (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="h-3 w-3 mr-1" /> Critical
                                </Badge>
                              ) : (
                                <Badge className="text-xs bg-orange-100 text-orange-800 border-orange-200" variant="outline">
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Low
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">OK</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDetail(item)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== Movements Tab ==================== */}
        <TabsContent value="movements" className="mt-4">
          <div className="flex gap-2 mb-4 flex-wrap">
            <Badge
              variant={movementFilter === '' ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1.5"
              onClick={() => setMovementFilter('')}
            >
              All
            </Badge>
            {Object.entries(movementTypeConfig).map(([type, config]) => (
              <Badge
                key={type}
                variant={movementFilter === type ? 'default' : 'outline'}
                className={`cursor-pointer px-3 py-1.5 ${movementFilter !== type ? config.color : ''}`}
                onClick={() => setMovementFilter(type === movementFilter ? '' : type)}
              >
                {config.label}
              </Badge>
            ))}
          </div>
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
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Stock After</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => {
                      const config = movementTypeConfig[m.movement_type] || { label: m.movement_type, color: 'bg-gray-50', icon: RefreshCw };
                      const MoveIcon = config.icon;
                      const isPositive = Number(m.quantity) > 0;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(m.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            <br />
                            <span className="text-muted-foreground">{new Date(m.performed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          </TableCell>
                          <TableCell className="font-medium text-sm">{m.inventory_item_name || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs capitalize ${config.color}`}>
                              <MoveIcon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {isPositive ? '+' : ''}{m.quantity}
                            </span>
                          </TableCell>
                          <TableCell>{m.unit_cost ? formatCurrency(Number(m.unit_cost)) : '—'}</TableCell>
                          <TableCell>{m.total_cost ? formatCurrency(Number(m.total_cost)) : '—'}</TableCell>
                          <TableCell>{m.stock_after ?? '—'}</TableCell>
                          <TableCell className="text-xs">{m.performed_by_name || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{m.notes || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== Suppliers Tab ==================== */}
        <TabsContent value="suppliers" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {suppliers.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <Truck className="h-12 w-12 mb-3 opacity-30" />
                  <p>No suppliers added yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Payment Terms</TableHead>
                      <TableHead>Delivery Days</TableHead>
                      <TableHead>Min Order</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{s.name}</p>
                          {s.city && <p className="text-xs text-muted-foreground">{s.city}, {s.country}</p>}
                        </TableCell>
                        <TableCell className="text-sm">{s.contact_name || '—'}</TableCell>
                        <TableCell className="text-sm">{s.phone || '—'}</TableCell>
                        <TableCell className="text-xs">{s.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.payment_terms || '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{s.delivery_days || '—'}</TableCell>
                        <TableCell>{s.minimum_order ? formatCurrency(Number(s.minimum_order)) : '—'}</TableCell>
                        <TableCell>
                          {s.rating ? (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <span key={i} className={`text-xs ${i < s.rating! ? 'text-amber-500' : 'text-gray-300'}`}>★</span>
                              ))}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== Create Item Dialog ==================== */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>Add a new item to your inventory tracking system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Extra Virgin Olive Oil" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={itemForm.category_id} onValueChange={(val) => setItemForm(p => ({ ...p, category_id: val }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={itemForm.description} onChange={(e) => setItemForm(p => ({ ...p, description: e.target.value }))} placeholder="Cold-pressed Italian EVOO, 1L bottles" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm(p => ({ ...p, sku: e.target.value }))} placeholder="OIL-001" />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" min="0" value={itemForm.unit_cost} onChange={(e) => setItemForm(p => ({ ...p, unit_cost: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input type="number" min="0" value={itemForm.current_stock} onChange={(e) => setItemForm(p => ({ ...p, current_stock: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Min Stock</Label>
                <Input type="number" min="0" value={itemForm.minimum_stock} onChange={(e) => setItemForm(p => ({ ...p, minimum_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Max Stock</Label>
                <Input type="number" min="0" value={itemForm.maximum_stock} onChange={(e) => setItemForm(p => ({ ...p, maximum_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input type="number" min="0" value={itemForm.reorder_point} onChange={(e) => setItemForm(p => ({ ...p, reorder_point: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Reorder Qty</Label>
                <Input type="number" min="0" value={itemForm.reorder_quantity} onChange={(e) => setItemForm(p => ({ ...p, reorder_quantity: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Storage Location</Label>
                <Input value={itemForm.storage_location} onChange={(e) => setItemForm(p => ({ ...p, storage_location: e.target.value }))} placeholder="Walk-in Cooler A" />
              </div>
              <div className="space-y-2">
                <Label>Storage Temperature</Label>
                <Input value={itemForm.storage_temperature} onChange={(e) => setItemForm(p => ({ ...p, storage_temperature: e.target.value }))} placeholder="2-4°C" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createItemMutation.mutate()} disabled={!itemForm.name || createItemMutation.isPending}>
              {createItemMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Edit Item Dialog ==================== */}
      <Dialog open={!!showEditItem} onOpenChange={(open) => !open && setShowEditItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>Update item details. Stock changes should be done via stock movements.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editForm.category_id} onValueChange={(val) => setEditForm(p => ({ ...p, category_id: val }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
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
                <Label>SKU</Label>
                <Input value={editForm.sku} onChange={(e) => setEditForm(p => ({ ...p, sku: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" min="0" value={editForm.unit_cost} onChange={(e) => setEditForm(p => ({ ...p, unit_cost: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Storage Location</Label>
                <Input value={editForm.storage_location} onChange={(e) => setEditForm(p => ({ ...p, storage_location: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Min Stock</Label>
                <Input type="number" min="0" value={editForm.minimum_stock} onChange={(e) => setEditForm(p => ({ ...p, minimum_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Max Stock</Label>
                <Input type="number" min="0" value={editForm.maximum_stock} onChange={(e) => setEditForm(p => ({ ...p, maximum_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input type="number" min="0" value={editForm.reorder_point} onChange={(e) => setEditForm(p => ({ ...p, reorder_point: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Reorder Qty</Label>
                <Input type="number" min="0" value={editForm.reorder_quantity} onChange={(e) => setEditForm(p => ({ ...p, reorder_quantity: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditItem(null)}>Cancel</Button>
            <Button onClick={() => updateItemMutation.mutate()} disabled={updateItemMutation.isPending}>
              {updateItemMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Item Detail Dialog ==================== */}
      <Dialog open={!!showDetail} onOpenChange={(open) => !open && setShowDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{showDetail?.name}</DialogTitle>
            <DialogDescription>{showDetail?.description || 'No description'}</DialogDescription>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">SKU</p>
                  <p className="font-mono font-medium">{showDetail.sku || '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{showDetail.category_name || '—'}</p>
                </div>
                <div className={`p-3 rounded-lg ${showDetail.is_low_stock ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className="text-xs text-muted-foreground">Current Stock</p>
                  <p className={`font-bold text-lg ${showDetail.is_low_stock ? 'text-red-600' : 'text-green-600'}`}>
                    {showDetail.current_stock} {showDetail.unit_abbreviation || ''}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Unit Cost</p>
                  <p className="font-medium">{formatCurrency(Number(showDetail.unit_cost))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Min / Max Stock</p>
                  <p className="font-medium">{showDetail.minimum_stock} / {showDetail.maximum_stock || '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Reorder Point / Qty</p>
                  <p className="font-medium">{showDetail.reorder_point || '—'} / {showDetail.reorder_quantity || '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Storage Location</p>
                  <p className="font-medium">{showDetail.storage_location || '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="font-medium">{formatCurrency(Number(showDetail.current_stock) * Number(showDetail.unit_cost))}</p>
                </div>
              </div>
              {showDetail.is_low_stock && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-orange-800 font-medium">
                    Below minimum stock level. Consider reordering {showDetail.reorder_quantity || 'some'} {showDetail.unit_abbreviation || 'units'}.
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== Stock Movement Dialog ==================== */}
      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Stock Movement</DialogTitle>
            <DialogDescription>Log a stock change for an inventory item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={movementForm.inventory_item_id} onValueChange={(val) => setMovementForm(p => ({ ...p, inventory_item_id: val }))}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="flex items-center gap-2">
                        {item.is_low_stock && <AlertTriangle className="h-3 w-3 text-orange-500" />}
                        {item.name} (Stock: {item.current_stock})
                      </span>
                    </SelectItem>
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
                    <SelectItem value="purchase">📦 Purchase (Stock In)</SelectItem>
                    <SelectItem value="usage">🍳 Usage (Stock Out)</SelectItem>
                    <SelectItem value="waste">🗑️ Waste / Spoilage</SelectItem>
                    <SelectItem value="adjustment">⚖️ Adjustment</SelectItem>
                    <SelectItem value="return">↩️ Return to Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity * {['usage', 'waste'].includes(movementForm.movement_type) ? '(will be deducted)' : ''}</Label>
                <Input type="number" min="0" step="0.1" value={movementForm.quantity} onChange={(e) => setMovementForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unit Cost ($)</Label>
              <Input type="number" step="0.01" min="0" value={movementForm.unit_cost} onChange={(e) => setMovementForm(p => ({ ...p, unit_cost: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={movementForm.notes} onChange={(e) => setMovementForm(p => ({ ...p, notes: e.target.value }))} placeholder="Weekly order from Fresh Farms Direct" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovement(false)}>Cancel</Button>
            <Button onClick={() => createMovementMutation.mutate()} disabled={!movementForm.inventory_item_id || !movementForm.quantity || createMovementMutation.isPending}>
              {createMovementMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Record Movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Create Category Dialog ==================== */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inventory Category</DialogTitle>
            <DialogDescription>Create a new inventory category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Oils & Condiments" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={catForm.description} onChange={(e) => setCatForm(p => ({ ...p, description: e.target.value }))} placeholder="Cooking oils, vinegars, and sauces" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateCategory(false)}>Cancel</Button>
            <Button onClick={() => createCatMutation.mutate()} disabled={!catForm.name || createCatMutation.isPending}>
              {createCatMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
