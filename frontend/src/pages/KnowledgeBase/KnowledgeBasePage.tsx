import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService } from '@/services/aiService';
import type { KnowledgeEntry } from '@/services/aiService';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Brain, Plus, Search, RefreshCw, Loader2, BookOpen,
  MessageSquare, Clock, FileText, Tag, CheckCircle, XCircle,
  Database, Sparkles, Trash2, Edit2, ChevronLeft, ChevronRight,
} from 'lucide-react';

const ENTRY_TYPES = [
  { value: 'info', label: 'Information', icon: BookOpen },
  { value: 'faq', label: 'FAQ', icon: MessageSquare },
  { value: 'hours', label: 'Hours', icon: Clock },
  { value: 'policy', label: 'Policy', icon: FileText },
  { value: 'campaign', label: 'Campaign', icon: Tag },
];

const getEntryIcon = (type: string) => {
  const found = ENTRY_TYPES.find(t => t.value === type);
  return found ? found.icon : BookOpen;
};

export function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const { company } = useAuthStore();
  const companyId = company?.id || '';

  const [activeTab, setActiveTab] = useState('entries');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [page, setPage] = useState(1);

  // Dialogs
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState('');

  // Forms
  const [entryForm, setEntryForm] = useState({
    title: '', content: '', short_answer: '', keywords: '',
    category_id: '', entry_type: 'info', priority: 0,
  });
  const [categoryForm, setCategoryForm] = useState({
    name: '', display_name: '', description: '', icon: '',
  });

  // ==================== Queries ====================

  const { data: categories = [] } = useQuery({
    queryKey: ['kb-categories', companyId],
    queryFn: () => aiService.getCategories(companyId),
    enabled: !!companyId,
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['kb-entries', companyId, selectedCategory, selectedType, searchQuery, page],
    queryFn: () => aiService.getEntries(companyId, {
      category_id: selectedCategory || undefined,
      entry_type: selectedType || undefined,
      search: searchQuery || undefined,
      page,
      page_size: 10,
    }),
    enabled: !!companyId,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['kb-sync-status', companyId],
    queryFn: () => aiService.getSyncStatus(companyId),
    enabled: !!companyId,
  });

  const { data: searchResults, isLoading: searchLoading, refetch: runSearch } = useQuery({
    queryKey: ['kb-search', companyId, semanticQuery],
    queryFn: () => aiService.semanticSearch(companyId, semanticQuery, 'all', 10),
    enabled: false, // Manual trigger
  });

  // ==================== Mutations ====================

  const createEntryMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...entryForm,
        keywords: entryForm.keywords.split(',').map(k => k.trim()).filter(Boolean),
        category_id: entryForm.category_id || undefined,
        priority: Number(entryForm.priority),
      };
      return aiService.createEntry(companyId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      queryClient.invalidateQueries({ queryKey: ['kb-sync-status'] });
      setShowCreateEntry(false);
      resetEntryForm();
      toast.success('Knowledge entry created');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create entry');
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: () => {
      if (!editingEntry) throw new Error('No entry selected');
      const payload = {
        ...entryForm,
        keywords: entryForm.keywords.split(',').map(k => k.trim()).filter(Boolean),
        category_id: entryForm.category_id || undefined,
        priority: Number(entryForm.priority),
      };
      return aiService.updateEntry(companyId, editingEntry.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      setEditingEntry(null);
      resetEntryForm();
      toast.success('Knowledge entry updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update entry');
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => aiService.deleteEntry(companyId, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      queryClient.invalidateQueries({ queryKey: ['kb-sync-status'] });
      toast.success('Entry deleted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete entry');
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () => aiService.createCategory(companyId, categoryForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      setShowCreateCategory(false);
      setCategoryForm({ name: '', display_name: '', description: '', icon: '' });
      toast.success('Category created');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create category');
    },
  });

  const syncKnowledgeMutation = useMutation({
    mutationFn: () => aiService.syncKnowledgeEmbeddings(companyId),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['kb-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['kb-entries'] });
      toast.success(data.message || 'Embeddings synced');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to sync embeddings');
    },
  });

  const syncMenuMutation = useMutation({
    mutationFn: () => aiService.syncMenuEmbeddings(companyId),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['kb-sync-status'] });
      toast.success(data.message || 'Menu embeddings synced');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to sync menu embeddings');
    },
  });

  // ==================== Helpers ====================

  const resetEntryForm = () => {
    setEntryForm({ title: '', content: '', short_answer: '', keywords: '', category_id: '', entry_type: 'info', priority: 0 });
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setEntryForm({
      title: entry.title,
      content: entry.content,
      short_answer: entry.short_answer || '',
      keywords: (entry.keywords || []).join(', '),
      category_id: entry.category_id || '',
      entry_type: entry.entry_type,
      priority: entry.priority,
    });
  };

  const entries = entriesData?.items || [];
  const totalPages = entriesData?.total_pages || 0;

  const handleSearch = () => {
    if (semanticQuery.length >= 2) {
      runSearch();
    }
  };

  // ==================== Render ====================

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        subtitle="Manage AI agent knowledge, FAQ, and semantic search"
      >
        <Button variant="outline" onClick={() => setShowSearch(true)}>
          <Sparkles className="h-4 w-4 mr-2" />
          Semantic Search
        </Button>
        <Button onClick={() => setShowCreateEntry(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </PageHeader>

      {/* Sync Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Knowledge Entries</p>
              <p className="text-2xl font-bold">{syncStatus?.knowledge_entries_total || 0}</p>
            </div>
            <BookOpen className="h-8 w-8 text-blue-500 opacity-50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">With Embeddings</p>
              <p className="text-2xl font-bold">{syncStatus?.knowledge_entries_with_embeddings || 0}</p>
            </div>
            <Database className="h-8 w-8 text-green-500 opacity-50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Menu Items Synced</p>
              <p className="text-2xl font-bold">{syncStatus?.menu_items_synced || 0}</p>
            </div>
            <Tag className="h-8 w-8 text-orange-500 opacity-50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-2">Sync Actions</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncKnowledgeMutation.mutate()}
                disabled={syncKnowledgeMutation.isPending}
              >
                {syncKnowledgeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span className="ml-1 text-xs">Knowledge</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncMenuMutation.mutate()}
                disabled={syncMenuMutation.isPending}
              >
                {syncMenuMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span className="ml-1 text-xs">Menu</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* Entries Tab */}
        <TabsContent value="entries" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENTRY_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entries List */}
          {entriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No knowledge entries found</p>
                <Button className="mt-4" onClick={() => setShowCreateEntry(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add First Entry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map((entry: KnowledgeEntry) => {
                const Icon = getEntryIcon(entry.entry_type);
                const category = categories.find(c => c.id === entry.category_id);
                return (
                  <Card key={entry.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{entry.title}</h3>
                            {entry.has_embedding ? (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <CheckCircle className="h-3 w-3 text-green-500" /> Embedded
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs gap-1">
                                <XCircle className="h-3 w-3 text-yellow-500" /> No Embedding
                              </Badge>
                            )}
                            {category && (
                              <Badge variant="outline" className="text-xs">{category.display_name}</Badge>
                            )}
                            <Badge variant="secondary" className="text-xs capitalize">{entry.entry_type}</Badge>
                            {entry.priority > 5 && (
                              <Badge className="text-xs bg-amber-100 text-amber-700">Priority {entry.priority}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{entry.short_answer || entry.content}</p>
                          {entry.keywords.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {entry.keywords.slice(0, 5).map((kw, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                              ))}
                              {entry.keywords.length > 5 && (
                                <Badge variant="outline" className="text-xs">+{entry.keywords.length - 5}</Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(entry)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => { if (confirm('Delete this entry?')) deleteEntryMutation.mutate(entry.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({entriesData?.total || 0} entries)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateCategory(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Category
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <Card key={cat.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{cat.display_name}</CardTitle>
                  <CardDescription>{cat.description || 'No description'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{cat.name}</Badge>
                    <Badge variant="outline">Order: {cat.sort_order}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== Create/Edit Entry Dialog ==================== */}
      <Dialog open={showCreateEntry || !!editingEntry} onOpenChange={(open) => {
        if (!open) {
          setShowCreateEntry(false);
          setEditingEntry(null);
          resetEntryForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Knowledge Entry' : 'New Knowledge Entry'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Update this knowledge base entry.' : 'Add information the AI agent can use to answer customer questions.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={entryForm.category_id} onValueChange={(v) => setEntryForm(p => ({ ...p, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={entryForm.entry_type} onValueChange={(v) => setEntryForm(p => ({ ...p, entry_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={entryForm.title}
                onChange={(e) => setEntryForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Restaurant Address, Cancellation Policy"
              />
            </div>

            <div className="space-y-2">
              <Label>Full Content *</Label>
              <Textarea
                value={entryForm.content}
                onChange={(e) => setEntryForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Detailed information for the AI to reference..."
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Short Answer (for AI responses)</Label>
              <Textarea
                value={entryForm.short_answer}
                onChange={(e) => setEntryForm(p => ({ ...p, short_answer: e.target.value }))}
                placeholder="Concise answer the AI will use when responding to customers..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Keywords (comma-separated)</Label>
                <Input
                  value={entryForm.keywords}
                  onChange={(e) => setEntryForm(p => ({ ...p, keywords: e.target.value }))}
                  placeholder="parking, valet, garage"
                />
              </div>
              <div className="space-y-2">
                <Label>Priority (0-10)</Label>
                <Input
                  type="number"
                  min={0} max={10}
                  value={entryForm.priority}
                  onChange={(e) => setEntryForm(p => ({ ...p, priority: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateEntry(false); setEditingEntry(null); resetEntryForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => editingEntry ? updateEntryMutation.mutate() : createEntryMutation.mutate()}
              disabled={!entryForm.title || !entryForm.content || createEntryMutation.isPending || updateEntryMutation.isPending}
            >
              {(createEntryMutation.isPending || updateEntryMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {editingEntry ? 'Update Entry' : 'Create Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Create Category Dialog ==================== */}
      <Dialog open={showCreateCategory} onOpenChange={setShowCreateCategory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
            <DialogDescription>Add a new category to organize knowledge base entries.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Internal Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="general_info"
              />
            </div>
            <div className="space-y-2">
              <Label>Display Name *</Label>
              <Input
                value={categoryForm.display_name}
                onChange={(e) => setCategoryForm(p => ({ ...p, display_name: e.target.value }))}
                placeholder="General Information"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateCategory(false)}>Cancel</Button>
            <Button
              onClick={() => createCategoryMutation.mutate()}
              disabled={!categoryForm.name || !categoryForm.display_name || createCategoryMutation.isPending}
            >
              {createCategoryMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Semantic Search Dialog ==================== */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Semantic Search (AI-powered)
            </DialogTitle>
            <DialogDescription>
              Search the knowledge base and menu using natural language. Requires embeddings to be generated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={semanticQuery}
                onChange={(e) => setSemanticQuery(e.target.value)}
                placeholder="e.g., What are your opening hours? Do you have vegan options?"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searchLoading || semanticQuery.length < 2}>
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {searchResults && (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {searchResults.results.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No results found. Make sure embeddings are generated.</p>
                ) : (
                  searchResults.results.map((result, i) => (
                    <Card key={result.id} className="border">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="text-sm font-mono text-muted-foreground w-6">#{i + 1}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{result.title}</span>
                              <Badge variant={result.source === 'menu' ? 'default' : 'secondary'} className="text-xs">
                                {result.source}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {(result.score * 100).toFixed(1)}% match
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{result.content}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
