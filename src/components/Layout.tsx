import { type ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FolderKanban, MapPin, Warehouse, Package,
  Truck, HardHat, ClipboardList, ArrowLeftRight, FileBarChart,
  Users, LogOut, Menu, Boxes, Building2, CreditCard, Settings,
  ScrollText, FileUp, Languages,
} from 'lucide-react'

interface NavItem {
  to: string
  labelKey: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

const companyNavItems: NavItem[] = [
  { to: '/', labelKey: 'layout:nav.dashboard', icon: LayoutDashboard },
  { to: '/work-orders', labelKey: 'layout:nav.workOrders', icon: ClipboardList },
  { to: '/movements', labelKey: 'layout:nav.movements', icon: ArrowLeftRight },
  { to: '/reports', labelKey: 'layout:nav.reports', icon: FileBarChart },
  { to: '/projects', labelKey: 'layout:nav.projects', icon: FolderKanban, adminOnly: true },
  { to: '/work-locations', labelKey: 'layout:nav.workLocations', icon: MapPin, adminOnly: true },
  { to: '/warehouses', labelKey: 'layout:nav.warehouses', icon: Warehouse, adminOnly: true },
  { to: '/materials', labelKey: 'layout:nav.materials', icon: Package, adminOnly: true },
  { to: '/suppliers', labelKey: 'layout:nav.suppliers', icon: Truck, adminOnly: true },
  { to: '/contractors', labelKey: 'layout:nav.contractors', icon: HardHat, adminOnly: true },
  { to: '/users', labelKey: 'layout:nav.users', icon: Users, adminOnly: true },
  { to: '/subscription', labelKey: 'layout:nav.subscription', icon: CreditCard },
]

const superAdminNavItems: NavItem[] = [
  { to: '/admin', labelKey: 'layout:nav.dashboard', icon: LayoutDashboard },
  { to: '/admin/companies', labelKey: 'layout:nav.companies', icon: Building2 },
  { to: '/admin/subscriptions', labelKey: 'layout:nav.subscriptions', icon: CreditCard },
  { to: '/admin/plans', labelKey: 'layout:nav.plansFeatures', icon: Settings },
  { to: '/admin/audit-log', labelKey: 'layout:nav.auditLog', icon: ScrollText },
  { to: '/admin/subscription-requests', labelKey: 'layout:nav.upgradeRequests', icon: FileUp },
]

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { profile, signOut, isSuperAdmin } = useAuth()
  const { lang, toggleLang } = useLanguage()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const navItems = isSuperAdmin ? superAdminNavItems : companyNavItems
  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || profile?.role === 'company_admin'
  )

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top horizontal navigation bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-gray-200 px-4">
        <div className="flex h-full items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Boxes className="h-6 w-6 text-brand-600" />
            <span className="text-lg font-bold text-gray-900">InfraFlow</span>
          </div>

          {/* Menu dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/20"
                  onClick={() => setMenuOpen(false)}
                />
                <nav className="absolute end-0 top-full z-50 mt-2 w-56 rounded-xl bg-white p-2 shadow-lg ring-1 ring-black/5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/' || item.to === '/admin'}
                      onClick={() => setMenuOpen(false)}
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
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </nav>
              </>
            )}
          </div>

          {/* User actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            >
              <Languages className="h-5 w-5" />
              <span className="hidden md:inline">{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden md:inline">{t('layout:user.signOut')}</span>
            </button>
            <div className="hidden text-start md:block">
              <p className="text-sm font-medium text-gray-900">{isSuperAdmin ? t('layout:user.superAdmin') : profile?.full_name}</p>
              <p className="text-xs text-gray-500">{isSuperAdmin ? t('layout:user.platformAdmin') : profile?.email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-16 px-6 pb-6">
        {children}
      </main>
    </div>
  )
}
