import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FolderKanban, MapPin, Warehouse, Package,
  Truck, HardHat, ClipboardList, ArrowLeftRight, FileBarChart,
  Users, LogOut, Building2, CreditCard, Settings,
  ScrollText, FileUp, Languages,
} from 'lucide-react'

interface NavItem {
  to: string
  labelKey: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

const companyNavGroups: NavGroup[] = [
  {
    labelKey: 'layout:sections.main',
    items: [
      { to: '/', labelKey: 'layout:nav.dashboard', icon: LayoutDashboard },
      { to: '/work-orders', labelKey: 'layout:nav.workOrders', icon: ClipboardList },
      { to: '/movements', labelKey: 'layout:nav.movements', icon: ArrowLeftRight },
      { to: '/reports', labelKey: 'layout:nav.reports', icon: FileBarChart },
    ],
  },
  {
    labelKey: 'layout:sections.projects',
    items: [
      { to: '/projects', labelKey: 'layout:nav.projects', icon: FolderKanban, adminOnly: true },
      { to: '/work-locations', labelKey: 'layout:nav.workLocations', icon: MapPin, adminOnly: true },
    ],
  },
  {
    labelKey: 'layout:sections.inventory',
    items: [
      { to: '/warehouses', labelKey: 'layout:nav.warehouses', icon: Warehouse, adminOnly: true },
      { to: '/materials', labelKey: 'layout:nav.materials', icon: Package, adminOnly: true },
      { to: '/suppliers', labelKey: 'layout:nav.suppliers', icon: Truck, adminOnly: true },
      { to: '/contractors', labelKey: 'layout:nav.contractors', icon: HardHat, adminOnly: true },
    ],
  },
  {
    labelKey: 'layout:sections.administration',
    items: [
      { to: '/users', labelKey: 'layout:nav.users', icon: Users, adminOnly: true },
      { to: '/subscription', labelKey: 'layout:nav.subscription', icon: CreditCard },
    ],
  },
]

const superAdminNavGroups: NavGroup[] = [
  {
    labelKey: 'layout:sections.platform',
    items: [
      { to: '/admin', labelKey: 'layout:nav.dashboard', icon: LayoutDashboard },
      { to: '/admin/companies', labelKey: 'layout:nav.companies', icon: Building2 },
      { to: '/admin/subscriptions', labelKey: 'layout:nav.subscriptions', icon: CreditCard },
      { to: '/admin/plans', labelKey: 'layout:nav.plansFeatures', icon: Settings },
      { to: '/admin/audit-log', labelKey: 'layout:nav.auditLog', icon: ScrollText },
      { to: '/admin/subscription-requests', labelKey: 'layout:nav.upgradeRequests', icon: FileUp },
    ],
  },
]

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { profile, signOut, isSuperAdmin } = useAuth()
  const { lang, dir, toggleLang } = useLanguage()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const groups = isSuperAdmin ? superAdminNavGroups : companyNavGroups

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.adminOnly || profile?.role === 'company_admin'
      ),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="min-h-screen bg-gray-50" dir={dir}>
      {/* Top application header */}
      <header className="fixed top-0 inset-x-0 z-50 h-14 border-b border-gray-200 bg-white px-4 shadow-sm">
        <div className="flex h-full items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gray-900">
              <img src="/logo.png" alt="InfraFlow" className="h-full w-full object-contain" />
            </div>
            <span className="text-lg font-bold text-gray-900">InfraFlow</span>
          </div>

          {/* User actions */}
          <div className="flex items-center gap-2">
            <div className="hidden text-start md:block">
              <p className="text-sm font-medium text-gray-900">
                {isSuperAdmin ? t('layout:user.superAdmin') : profile?.full_name}
              </p>
              <p className="text-xs text-gray-500">
                {isSuperAdmin ? t('layout:user.platformAdmin') : profile?.email}
              </p>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              title={t('layout:user.signOut')}
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden md:inline">{t('layout:user.signOut')}</span>
            </button>

            <button
              onClick={toggleLang}
              className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            >
              <Languages className="h-5 w-5" />
              <span className="hidden md:inline">{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Horizontal navigation ribbon — all commands visible across the bar */}
      <nav className="fixed top-14 inset-x-0 z-40 h-16 border-b border-gray-200 bg-white px-2 shadow-sm md:px-4">
        <div className="flex h-full min-w-max items-center gap-2 overflow-x-auto">
          {visibleGroups.map((group) => (
            <div
              key={group.labelKey}
              className="flex h-full flex-col items-center justify-between border-e border-gray-200 pe-2 last:border-e-0 md:pe-3"
            >
              <div className="flex items-center gap-1">
                {group.items.map((item) => {
                  const label = t(item.labelKey)
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/' || item.to === '/admin'}
                      title={label}
                      className={({ isActive }) =>
                        cn(
                          'flex h-12 w-[4.2rem] flex-col items-center justify-center rounded-lg px-1 text-[10px] font-medium leading-tight transition-colors md:w-20',
                          isActive
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0 md:h-5 md:w-5" />
                      <span className="mt-0.5 block w-full break-words text-center max-h-6 overflow-hidden">
                        {label}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
              <span className="hidden pb-1 text-[10px] font-semibold uppercase text-gray-400 lg:block">
                {t(group.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="min-h-screen bg-gray-50 px-4 pt-[7.5rem] pb-6 md:px-6">
        {children}
      </main>
    </div>
  )
}
