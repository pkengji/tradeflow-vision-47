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
  desktopHeaderRight,
  desktopHeaderLeft,
  showBackButton = false,
}: { 
  children: React.ReactNode;
  pageTitle?: string;
  mobileHeaderRight?: ReactNode;
  mobileHeaderLeft?: ReactNode;
  desktopHeaderRight?: ReactNode;
  desktopHeaderLeft?: ReactNode;
  showBackButton?: boolean;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-background">
      {/* Desktop Outer Header */}
      <header className="hidden lg:block sticky top-0 z-50 border-b bg-background">
        <div className="flex h-14 items-center px-4">
          <div className="flex items-center gap-2">
            <CandlestickChart className="h-6 w-6" />
            <h1 className="text-lg font-semibold">Shpatsbot</h1>
          </div>

          <div className="flex-1"></div>

          <div className="flex items-center gap-4">
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

      <div className="flex lg:min-h-[calc(100vh-3.5rem)]">
        {/* Desktop Fixed Sidebar */}
        <aside className="hidden lg:block w-64 border-r sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <nav className="p-4">
            <NavLinks />
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-screen lg:min-h-0 pb-16 lg:pb-0">
          {/* Inner Header (Mobile always, Desktop below outer header) */}
          <header className="sticky top-0 lg:top-14 z-40 border-b bg-background">
            <div className="flex h-14 items-center px-4 relative">
              {/* Left side: back button or custom left element */}
              <div className="flex items-center gap-2 absolute left-4">
                {/* Mobile: use mobileHeaderLeft */}
                <div className="lg:hidden">
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
                {/* Desktop: use desktopHeaderLeft */}
                <div className="hidden lg:block">
                  {desktopHeaderLeft}
                </div>
              </div>
              
              {/* Centered title - absolutely positioned */}
              <h1 className="absolute left-1/2 -translate-x-1/2 text-[var(--font-size-page-title)] font-semibold whitespace-nowrap">
                {currentPageTitle}
              </h1>
              
              {/* Right side: filter button or spacer */}
              <div className="w-10 flex justify-end ml-auto">
                {/* Mobile: use mobileHeaderRight */}
                <div className="lg:hidden">
                  {mobileHeaderRight}
                </div>
                {/* Desktop: use desktopHeaderRight */}
                <div className="hidden lg:block">
                  {desktopHeaderRight}
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
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
