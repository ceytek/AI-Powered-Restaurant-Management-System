import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuService } from '@/services/menuService';
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
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { UtensilsCrossed, Loader2, Leaf, Clock, DollarSign, Flame, Star, FolderPlus } from 'lucide-react';
import type { MenuItem, MenuCategory } from '@/types';

export function MenuPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [itemForm, setItemForm] = useState({
    name: '', description: '', price: '', cost_price: '', category_id: '',
    calories: '', preparation_time: '', is_vegetarian: false, is_vegan: false,
    is_gluten_free: false, is_spicy: false, is_featured: false,
  });
  const [catForm, setCatForm] = useState({ name: '', description: '', sort_order: 0 });

  const { data: categories } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => menuService.getCategories(),
  });

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['menu-items', search, categoryFilter],
    queryFn: () => menuService.getItems({
      page_size: 50, search: search || undefined,
      category_id: categoryFilter || undefined,
    }),
  });

  const createItemMutation = useMutation({
    mutationFn: () => menuService.createItem({
      ...itemForm,
      price: Number(itemForm.price),
      cost_price: itemForm.cost_price ? Number(itemForm.cost_price) : undefined,
      calories: itemForm.calories ? Number(itemForm.calories) : undefined,
      preparation_time: itemForm.preparation_time ? Number(itemForm.preparation_time) : undefined,
      category_id: itemForm.category_id || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      setShowCreateItem(false);
      setItemForm({ name: '', description: '', price: '', cost_price: '', category_id: '', calories: '', preparation_time: '', is_vegetarian: false, is_vegan: false, is_gluten_free: false, is_spicy: false, is_featured: false });
      toast.success('Menu item created');
    },
    onError: () => toast.error('Failed to create menu item'),
  });

  const createCatMutation = useMutation({
    mutationFn: () => menuService.createCategory(catForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] });
      setShowCreateCategory(false);
      setCatForm({ name: '', description: '', sort_order: 0 });
      toast.success('Category created');
    },
    onError: () => toast.error('Failed to create category'),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, is_available }: { id: string; is_available: boolean }) =>
      menuService.updateItem(id, { is_available }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      toast.success('Availability updated');
    },
  });

  const items = itemsData?.items ?? [];
  const allCategories = categories ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu Management"
        subtitle={`${itemsData?.total ?? 0} items across ${allCategories.length} categories`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search menu items..."
        onAdd={() => setShowCreateItem(true)}
        addLabel="Add Item"
      >
        <Button variant="outline" size="sm" onClick={() => setShowCreateCategory(true)}>
          <FolderPlus className="h-4 w-4 mr-1" /> Add Category
        </Button>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {allCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} ({c.item_count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Categories Overview */}
      {allCategories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {allCategories.map((c) => (
            <Badge key={c.id} variant={categoryFilter === c.id ? 'default' : 'outline'} className="cursor-pointer px-3 py-1.5"
              onClick={() => setCategoryFilter(categoryFilter === c.id ? '' : c.id)}>
              {c.name} <span className="ml-1 opacity-70">({c.item_count})</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Menu Items */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <UtensilsCrossed className="h-12 w-12 mb-3 opacity-30" />
            <p>No menu items found. Add your first item!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <MenuItemCard key={item.id} item={item} onToggle={(val) => toggleAvailability.mutate({ id: item.id, is_available: val })} />
          ))}
        </div>
      )}

      {/* Create Item Dialog */}
      <Dialog open={showCreateItem} onOpenChange={setShowCreateItem}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Menu Item</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Grilled Salmon" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={itemForm.description} onChange={(e) => setItemForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Price *</Label>
                <Input type="number" step="0.01" min="0" value={itemForm.price} onChange={(e) => setItemForm(p => ({ ...p, price: e.target.value }))} placeholder="24.99" />
              </div>
              <div className="space-y-2">
                <Label>Cost Price</Label>
                <Input type="number" step="0.01" min="0" value={itemForm.cost_price} onChange={(e) => setItemForm(p => ({ ...p, cost_price: e.target.value }))} />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Calories</Label>
                <Input type="number" min="0" value={itemForm.calories} onChange={(e) => setItemForm(p => ({ ...p, calories: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prep Time (min)</Label>
                <Input type="number" min="0" value={itemForm.preparation_time} onChange={(e) => setItemForm(p => ({ ...p, preparation_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                { key: 'is_vegetarian', label: 'Vegetarian' },
                { key: 'is_vegan', label: 'Vegan' },
                { key: 'is_gluten_free', label: 'Gluten Free' },
                { key: 'is_spicy', label: 'Spicy' },
                { key: 'is_featured', label: 'Featured' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-sm">{label}</Label>
                  <Switch checked={(itemForm as Record<string, unknown>)[key] as boolean} onCheckedChange={(val) => setItemForm(p => ({ ...p, [key]: val }))} />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateItem(false)}>Cancel</Button>
            <Button onClick={() => createItemMutation.mutate()} disabled={!itemForm.name || !itemForm.price || createItemMutation.isPending}>
              {createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Appetizers" />
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

function MenuItemCard({ item, onToggle }: { item: MenuItem; onToggle: (val: boolean) => void }) {
  const margin = item.cost_price ? (((Number(item.price) - Number(item.cost_price)) / Number(item.price)) * 100).toFixed(0) : null;

  return (
    <Card className={`overflow-hidden transition-all ${!item.is_available ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{item.name}</h3>
              {item.is_featured && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
            </div>
            {item.category_name && (
              <Badge variant="outline" className="text-[10px] mt-1">{item.category_name}</Badge>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-lg">${item.price}</p>
            {margin && <p className="text-[10px] text-muted-foreground">{margin}% margin</p>}
          </div>
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.description}</p>
        )}

        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          {item.calories && <span className="flex items-center gap-1">🔥 {item.calories} cal</span>}
          {item.preparation_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {item.preparation_time}m</span>}
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {item.is_vegetarian && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200"><Leaf className="h-2.5 w-2.5 mr-0.5" />Veg</Badge>}
          {item.is_vegan && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Vegan</Badge>}
          {item.is_gluten_free && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">GF</Badge>}
          {item.is_spicy && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200"><Flame className="h-2.5 w-2.5 mr-0.5" />Spicy</Badge>}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">Available</span>
          <Switch checked={item.is_available} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  );
}
