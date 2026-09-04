import { NavLink } from 'react-router-dom';
import { Home, Settings, Sun, Moon, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  { icon: Home, label: 'Dashboard', to: '/' },
  { icon: Settings, label: 'Settings', to: '/settings' },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { theme, setTheme } = useTheme();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300"
      style={{ width: collapsed ? 60 : 200 }}
    >
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map(({ icon: Icon, label, to }) => (
          <Tooltip key={to} delayDuration={collapsed ? 0 : 9999}>
            <TooltipTrigger asChild>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">{label}</TooltipContent>
            )}
          </Tooltip>
        ))}
      </nav>

      <div className="space-y-1 p-2">
        <Separator className="mb-2" />
        <Tooltip delayDuration={collapsed ? 0 : 9999}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 px-3"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 shrink-0" />
              ) : (
                <Moon className="h-4 w-4 shrink-0" />
              )}
              {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </TooltipContent>
          )}
        </Tooltip>

        <Tooltip delayDuration={collapsed ? 0 : 9999}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 px-3"
              onClick={onToggle}
            >
              {collapsed ? (
                <PanelLeft className="h-4 w-4 shrink-0" />
              ) : (
                <PanelLeftClose className="h-4 w-4 shrink-0" />
              )}
              {!collapsed && <span>Collapse</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Expand</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}
