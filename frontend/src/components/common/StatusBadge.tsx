import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  available: 'bg-green-100 text-green-800 border-green-200',
  occupied: 'bg-red-100 text-red-800 border-red-200',
  reserved: 'bg-blue-100 text-blue-800 border-blue-200',
  maintenance: 'bg-gray-100 text-gray-800 border-gray-200',
  cleaning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  seated: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  no_show: 'bg-orange-100 text-orange-800 border-orange-200',
  checked_in: 'bg-purple-100 text-purple-800 border-purple-200',
  active: 'bg-green-100 text-green-800 border-green-200',
  on_leave: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  suspended: 'bg-orange-100 text-orange-800 border-orange-200',
  terminated: 'bg-red-100 text-red-800 border-red-200',
  waiting: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  notified: 'bg-blue-100 text-blue-800 border-blue-200',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  return (
    <Badge variant="outline" className={cn(style, 'capitalize font-medium', className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
