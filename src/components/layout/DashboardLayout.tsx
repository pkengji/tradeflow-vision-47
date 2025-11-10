import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, CandlestickChart, Bell, Bot, Settings, LogOut, Menu, ChevronLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Trades', href: '/trades', icon: CandlestickChart },
  { name: 'Signale', href: '/signals', icon: Bell },
  { name: 'Bots', href: '/bots', icon: Bot },
  { name: 'Einstellungen', href: '/settings', icon: Settings },
];

export function DashboardLayout({ 
  children, 
  pageTitle, 
  mobileHeaderRight,
  mobileHeaderLeft,
  showBackButton = false,
}: { 
  children: React.ReactNode;
  pageTitle?: string;
  mobileHeaderRight?: ReactNode;
  mobileHeaderLeft?: ReactNode;
  showBackButton?: boolean;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-detect page title if not provided
  const currentPageTitle = pageTitle || navigation.find(item => item.href === location.pathname)?.name || '';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive = location.pathname === item.href || 
          (item.href !== '/' && location.pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      {/* Header - Mobile */}
      <header className="lg:hidden sticky top-0 z-40 border-b bg-background">
        <div className="flex h-14 items-center px-4">
          {/* Left side: back button or custom left element */}
          <div className="flex items-center gap-2">
            {mobileHeaderLeft}
            {showBackButton && !mobileHeaderLeft && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
          </div>
          
          {/* Centered title */}
          <h1 className="flex-1 text-center text-[var(--font-size-page-title)] font-semibold">
            {currentPageTitle}
          </h1>
          
          {/* Filter button on right (if provided), or spacer */}
          <div className="w-10">
            {mobileHeaderRight}
          </div>
        </div>
      </header>

      {/* Header - Desktop */}
      <header className="hidden lg:block sticky top-0 z-40 border-b bg-background">
        <div className="flex h-14 items-center px-4 gap-4">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex flex-col h-full">
                <nav className="flex-1 p-4 pt-6">
                  <NavLinks onNavigate={() => setMobileMenuOpen(false)} />
                </nav>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <CandlestickChart className="h-6 w-6" />
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.email}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-64 border-r min-h-[calc(100vh-3.5rem)] sticky top-14">
          <nav className="p-4">
            <NavLinks />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
        <div className="grid grid-cols-5 h-16">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || 
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-xs transition-colors',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
