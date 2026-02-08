import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CalendarDays,
  Armchair,
  Users,
  UtensilsCrossed,
  TrendingUp,
  Clock,
} from 'lucide-react';

export function DashboardPage() {
  const { user, company } = useAuthStore();

  const stats = [
    {
      title: "Today's Reservations",
      value: '—',
      icon: CalendarDays,
      description: 'Coming soon',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Available Tables',
      value: '—',
      icon: Armchair,
      description: 'Coming soon',
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Active Staff',
      value: '—',
      icon: Users,
      description: 'Coming soon',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'Menu Items',
      value: '—',
      icon: UtensilsCrossed,
      description: 'Coming soon',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening at <span className="font-medium">{company?.name}</span> today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Upcoming Reservations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p className="text-sm">Reservation data will appear here</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Quick Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p className="text-sm">Analytics data will appear here</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
