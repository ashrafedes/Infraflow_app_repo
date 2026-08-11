import { type ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FolderKanban, MapPin, Warehouse, Package,
  Truck, HardHat, ClipboardList, ArrowLeftRight, FileBarChart,
  Users, LogOut, Menu, Boxes, Building2, CreditCard, Settings,
  ScrollText, FileUp,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

const companyNavItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/work-orders', label: 'Work Orders', icon: ClipboardList },
  { to: '/movements', label: 'Movements', icon: ArrowLeftRight },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/projects', label: 'Projects', icon: FolderKanban, adminOnly: true },
  { to: '/work-locations', label: 'Work Locations', icon: MapPin, adminOnly: true },
  { to: '/warehouses', label: 'Warehouses', icon: Warehouse, adminOnly: true },
  { to: '/materials', label: 'Materials', icon: Package, adminOnly: true },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, adminOnly: true },
  { to: '/contractors', label: 'Contractors', icon: HardHat, adminOnly: true },
  { to: '/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/subscription', label: 'Subscription', icon: CreditCard },
]

const superAdminNavItems: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/companies', label: 'Companies', icon: Building2 },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/plans', label: 'Plans & Features', icon: Settings },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
  { to: '/admin/subscription-requests', label: 'Upgrade Requests', icon: FileUp },
]

export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const navItems = isSuperAdmin ? superAdminNavItems : companyNavItems
  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || profile?.role === 'company_admin'
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed z-40 h-full w-64 bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
          <Boxes className="h-6 w-6 text-brand-600" />
          <span className="text-lg font-bold text-gray-900">InfraFlow</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/admin'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <div className="mb-3 px-3">
            <p className="text-sm font-medium text-gray-900">{isSuperAdmin ? 'Super Admin' : profile?.full_name}</p>
            <p className="text-xs text-gray-500">{isSuperAdmin ? 'Platform Administrator' : profile?.email}</p>
            {!isSuperAdmin && <p className="text-xs text-gray-400 capitalize mt-1">{profile?.role.replace('_', ' ')}</p>}
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-brand-600" />
            <span className="font-bold">InfraFlow</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
