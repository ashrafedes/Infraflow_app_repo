import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { SubscriptionProvider } from '@/contexts/SubscriptionContext'
import { Layout } from '@/components/Layout'
import { AuthPage } from '@/pages/AuthPage'
import { CompanySetup } from '@/pages/CompanySetup'
import { Dashboard } from '@/pages/Dashboard'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { WorkLocationsPage } from '@/pages/WorkLocationsPage'
import { WarehousesPage } from '@/pages/WarehousesPage'
import { MaterialsPage } from '@/pages/MaterialsPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { ContractorsPage } from '@/pages/ContractorsPage'
import { WorkOrdersPage } from '@/pages/WorkOrdersPage'
import { WorkOrderDetailPage } from '@/pages/WorkOrderDetailPage'
import { MovementsPage } from '@/pages/MovementsPage'
import { NewMovementPage } from '@/pages/NewMovementPage'
import { MovementDetailPage } from '@/pages/MovementDetailPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { UsersPage } from '@/pages/UsersPage'
import { SuperAdminDashboard } from '@/pages/SuperAdminDashboard'
import { SuperAdminCompanies } from '@/pages/SuperAdminCompanies'
import { SuperAdminCompanyDetail } from '@/pages/SuperAdminCompanyDetail'
import { SuperAdminSubscriptions } from '@/pages/SuperAdminSubscriptions'
import { SuperAdminPlans } from '@/pages/SuperAdminPlans'
import { SuperAdminAuditLog } from '@/pages/SuperAdminAuditLog'
import { SuperAdminUpgradeRequests } from '@/pages/SuperAdminUpgradeRequests'
import { SubscriptionPage } from '@/pages/SubscriptionPage'

function ProtectedRoutes() {
  const { profile, loading, needsCompanySetup, isSuperAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!profile && !isSuperAdmin) {
    return <AuthPage />
  }

  if (needsCompanySetup && !isSuperAdmin) {
    return <CompanySetup />
  }

  if (isSuperAdmin) {
    return (
      <Layout>
        <Routes>
          <Route path="/admin" element={<SuperAdminDashboard />} />
          <Route path="/admin/companies" element={<SuperAdminCompanies />} />
          <Route path="/admin/companies/:id" element={<SuperAdminCompanyDetail />} />
          <Route path="/admin/subscriptions" element={<SuperAdminSubscriptions />} />
          <Route path="/admin/plans" element={<SuperAdminPlans />} />
          <Route path="/admin/audit-log" element={<SuperAdminAuditLog />} />
          <Route path="/admin/subscription-requests" element={<SuperAdminUpgradeRequests />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Layout>
    )
  }

  return (
    <SubscriptionProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/work-locations" element={<WorkLocationsPage />} />
          <Route path="/warehouses" element={<WarehousesPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/contractors" element={<ContractorsPage />} />
          <Route path="/work-orders" element={<WorkOrdersPage />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
          <Route path="/movements" element={<MovementsPage />} />
          <Route path="/movements/new" element={<NewMovementPage />} />
          <Route path="/movements/:id" element={<MovementDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </SubscriptionProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}
