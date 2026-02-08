import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, UtensilsCrossed, Building2, Mail, Lock, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    company_code: '',
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(formData.company_code, formData.email, formData.password);
      toast.success('Login successful! Welcome back.');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      let message = 'Login failed. Please check your credentials.';
      try {
        const axiosErr = err as { response?: { data?: { detail?: unknown } } };
        const detail = axiosErr?.response?.data?.detail;
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail) && detail.length > 0) {
          message = detail
            .map((d: { msg?: string }) => (typeof d?.msg === 'string' ? d.msg : JSON.stringify(d)))
            .join(', ');
        }
      } catch {
        // If error parsing fails, use default message
      }
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-center items-center p-12 text-primary-foreground relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full border-2 border-current" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full border-2 border-current" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full border-2 border-current" />
        </div>

        <div className="relative z-10 text-center max-w-md">
          <div className="flex justify-center mb-8">
            <div className="bg-primary-foreground/20 p-6 rounded-2xl">
              <UtensilsCrossed className="h-16 w-16" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Restaurant Management System
          </h1>
          <p className="text-lg opacity-90 leading-relaxed">
            AI-powered platform to manage reservations, tables, menu, inventory, 
            and staff — all in one place. Let our AI agent handle customer calls 
            while you focus on what matters.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-none lg:shadow-lg lg:border">
          <CardHeader className="space-y-3 text-center">
            {/* Mobile logo */}
            <div className="flex justify-center lg:hidden mb-2">
              <div className="bg-primary p-3 rounded-xl">
                <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
            <CardDescription className="text-base">
              Sign in to your restaurant management panel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Inline Error Message */}
              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Company Code */}
              <div className="space-y-2">
                <Label htmlFor="company_code" className="text-sm font-medium">
                  Company Code
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company_code"
                    name="company_code"
                    type="text"
                    placeholder="e.g. DEMO01"
                    value={formData.company_code}
                    onChange={handleChange}
                    className="pl-10 h-11"
                    required
                    disabled={isLoading}
                    autoComplete="organization"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="admin@restaurant.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 h-11"
                    required
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 h-11"
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-11 text-base font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {/* Demo credentials hint */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed">
              <p className="text-xs text-muted-foreground text-center">
                <span className="font-semibold">Demo credentials:</span><br />
                Company: <code className="bg-muted px-1 rounded">DEMO01</code> | 
                Email: <code className="bg-muted px-1 rounded">admin@demo.com</code> | 
                Pass: <code className="bg-muted px-1 rounded">admin123</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
