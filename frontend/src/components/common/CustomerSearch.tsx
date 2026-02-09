import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { customerService } from '@/services/customerService';
import { Crown, Search, Phone, Mail, User, X } from 'lucide-react';
import type { CustomerBrief } from '@/types';

interface CustomerSearchProps {
  onSelect: (customer: CustomerBrief) => void;
  onClear: () => void;
  selectedCustomer: CustomerBrief | null;
  placeholder?: string;
}

export function CustomerSearch({ onSelect, onClear, selectedCustomer, placeholder = 'Search customer by name, phone or email...' }: CustomerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerBrief[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await customerService.searchCustomers(query);
        setResults(data);
        setIsOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (customer: CustomerBrief) => {
    onSelect(customer);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear();
    setQuery('');
  };

  // If a customer is selected, show their info card
  if (selectedCustomer) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-dashed">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-primary">
            {selectedCustomer.first_name[0]}{selectedCustomer.last_name?.[0] || ''}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-sm">
              {selectedCustomer.first_name} {selectedCustomer.last_name || ''}
            </p>
            {selectedCustomer.vip_status && (
              <Crown className="h-3.5 w-3.5 text-yellow-500" />
            )}
            <Badge variant="outline" className="text-[10px] ml-1">
              {selectedCustomer.total_visits} visits
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            {selectedCustomer.phone && (
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedCustomer.phone}</span>
            )}
            {selectedCustomer.email && (
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedCustomer.email}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="p-1 hover:bg-background rounded transition-colors"
          title="Clear selection"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-10 h-10"
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-[240px] overflow-y-auto">
            {results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                onClick={() => handleSelect(customer)}
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-primary">
                    {customer.first_name[0]}{customer.last_name?.[0] || ''}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">
                      {customer.first_name} {customer.last_name || ''}
                    </span>
                    {customer.vip_status && <Crown className="h-3 w-3 text-yellow-500" />}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {customer.phone && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                    )}
                    {customer.email && (
                      <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{customer.email}</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">
                  {customer.total_visits} visits
                </Badge>
              </button>
            ))}
          </div>
          <div className="border-t px-3 py-2 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <User className="h-3 w-3 inline mr-1" />
              No match? Fill in the fields below to create a new customer automatically.
            </p>
          </div>
        </div>
      )}

      {query.length > 0 && query.length < 2 && (
        <p className="text-xs text-muted-foreground mt-1">Type at least 2 characters to search...</p>
      )}
      {query.length >= 2 && !isSearching && results.length === 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          No customers found for "{query}". Fill in the fields below to add a new one.
        </p>
      )}
    </div>
  );
}
