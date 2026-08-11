import { type ReactNode, useEffect, useState, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FolderKanban, MapPin, Warehouse, Package,
  Truck, HardHat, ClipboardList, ArrowLeftRight, FileBarChart,
  Users, LogOut, Menu, Boxes, Building2, CreditCard, Settings,
  ScrollText, FileUp, Languages, X, ChevronLeft, ChevronRight,
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

const SIDEBAR_COLLAPSED_KEY = 'infraflow-sidebar-collapsed'
const EXPANDED_WIDTH = 280
const COLLAPSED_WIDTH = 72
const MOBILE_BREAKPOINT = 768

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { profile, signOut, isSuperAdmin } = useAuth()
  const { lang, dir, toggleLang } = useLanguage()
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return saved ? (JSON.parse(saved) as boolean) : false
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)

  const handleSignOut = useCallback(async () => {
    await signOut()
    navigate('/')
  }, [signOut, navigate])

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  const sidebarWidth = isMobile ? EXPANDED_WIDTH : (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH)

  const groups = isSuperAdmin ? superAdminNavGroups : companyNavGroups

  const renderNavLink = (item: NavItem, groupLabel: string) => {
    const label = t(item.labelKey)
    return (
      <NavLink
        key={item.to + groupLabel}
        to={item.to}
        end={item.to === '/' || item.to === '/admin'}
        onClick={() => setMobileOpen(false)}
        title={label}
        className={({ isActive }) =>
          cn(
            'group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200',
            collapsed ? 'justify-center px-2' : 'px-3',
            isActive
              ? cn(
                  'bg-brand-50 text-brand-700',
                  !collapsed && 'border-s-2 border-brand-600 ps-2.5'
                )
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )
        }
      >
        <item.icon className={cn('h-5 w-5 flex-shrink-0', collapsed ? '' : '')} />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    )
  }

  const renderSidebarContent = (drawer = false) => (
    <div className="flex h-full flex-col">
      {/* Sidebar header / collapse toggle */}
      <div className="flex h-16 items-center justify-end border-b border-gray-100 px-4">
        {drawer ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label={t('layout:sidebar.closeMenu')}
            title={t('layout:sidebar.closeMenu')}
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((p) => !p)}
            className={cn(
              'flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100',
              collapsed ? 'w-full' : 'gap-2'
            )}
            aria-label={collapsed ? t('layout:sidebar.expand') : t('layout:sidebar.collapse')}
            title={collapsed ? t('layout:sidebar.expand') : t('layout:sidebar.collapse')}
          >
            {dir === 'rtl' ? (
              collapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />
            ) : (
              collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />
            )}
            {!collapsed && <span className="text-sm">{collapsed ? t('layout:sidebar.expand') : t('layout:sidebar.collapse')}</span>}
          </button>
        )}
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || profile?.role === 'company_admin'
          )
          if (visibleItems.length === 0) return null
          return (
            <div key={group.labelKey} className="mb-6 last:mb-0">
              {!collapsed && (
                <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t(group.labelKey)}
                </div>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => renderNavLink(item, group.labelKey))}
              </div>
            </div>
          )
        })}
      </nav>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50" dir={dir}>
      {/* Sticky top header */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-gray-200 bg-white px-4 shadow-sm">
        <div className="flex h-full items-center justify-between">
          {/* Start side: mobile hamburger + user + language + sign-out */}
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* User name / email */}
            <div className="hidden text-start md:block">
              <p className="text-sm font-medium text-gray-900">
                {isSuperAdmin ? t('layout:user.superAdmin') : profile?.full_name}
              </p>
              <p className="text-xs text-gray-500">
                {isSuperAdmin ? t('layout:user.platformAdmin') : profile?.email}
              </p>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              title={t('layout:user.signOut')}
              aria-label={t('layout:user.signOut')}
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden md:inline">{t('layout:user.signOut')}</span>
            </button>

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
            >
              <Languages className="h-5 w-5" />
              <span className="hidden md:inline">{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>
          </div>

          {/* End side: logo */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">InfraFlow</span>
            <Boxes className="h-6 w-6 text-brand-600" />
          </div>
        </div>
      </header>

      {/* Desktop sidebar: pushes content via main margin */}
      <aside
        className={cn(
          'fixed top-16 bottom-0 start-0 z-40 hidden flex-col border-e border-gray-200 bg-white shadow-sm md:flex',
          'transition-[width] duration-300 ease-in-out'
        )}
        style={{ width: sidebarWidth }}
        aria-label="Main navigation"
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed top-16 bottom-0 start-0 z-50 flex w-[280px] flex-col border-e border-gray-200 bg-white shadow-lg md:hidden"
            style={{ width: EXPANDED_WIDTH }}
            aria-label="Mobile navigation"
          >
            {renderSidebarContent(true)}
          </aside>
        </>
      )}

      {/* Main content: reflows with sidebar state */}
      <main
        className="min-h-screen bg-gray-50 px-4 pt-16 pb-6 transition-[margin] duration-300 ease-in-out md:px-6"
        style={{ marginInlineStart: isMobile ? 0 : sidebarWidth }}
      >
        {children}
      </main>
    </div>
  )
}
