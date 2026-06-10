import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './contexts/AuthContext';
import { canAccessPath, isCoAdmin } from './config/rolePermissions';
import { getActiveCompanyId } from './utils/activeCompany';

// Layout
import Layout from './components/Layout/Layout';
import PlatformAdminLayout from './components/PlatformAdmin/PlatformAdminLayout';
import ErrorBoundary from './components/ErrorBoundary';

// Platform Admin Pages
import CDPLPlatformDashboardPage from './pages/platform-admin/CDPLPlatformDashboardPage';
import PlatformCompaniesPage from './pages/platform-admin/PlatformCompaniesPage';
import PlatformUsersPage from './pages/platform-admin/PlatformUsersPage';
import PlatformSettingsPage from './pages/platform-admin/PlatformSettingsPage';
import CDPLAdminsPage from './pages/platform-admin/CDPLAdminsPage';
import CDPLTeamsPage from './pages/platform-admin/CDPLTeamsPage';
import CDPLActivityLogsPage from './pages/platform-admin/CDPLActivityLogsPage';
import CDPLAuditLogsPage from './pages/platform-admin/CDPLAuditLogsPage';
import CDPLNotificationsPage from './pages/platform-admin/CDPLNotificationsPage';
import PlatformReportsPage from './pages/platform-admin/PlatformReportsPage';
import PlatformInsightsPage from './pages/platform-admin/PlatformInsightsPage';
import CDPLSubscriptionsPage from './pages/platform-admin/CDPLSubscriptionsPage';
import CDPLBillingPage from './pages/platform-admin/CDPLBillingPage';
import CDPLIntegrationsPage from './pages/platform-admin/CDPLIntegrationsPage';
import CDPLApiKeysPage from './pages/platform-admin/CDPLApiKeysPage';
import CDPLRecycleBinPage from './pages/platform-admin/CDPLRecycleBinPage';
import CDPLCompanyOwnersPage from './pages/platform-admin/CDPLCompanyOwnersPage';
import PlatformAccessControlPage from './pages/platform-admin/PlatformAccessControlPage';
import PlatformRolesPermissionsPage from './pages/platform-admin/PlatformRolesPermissionsPage';

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ClientsPage from './pages/ClientsPage';
import VendorsPage from './pages/VendorsPage';
import SettingsPage from './pages/SettingsPage';
import AccessControlPage from './pages/AccessControlPage';
import AddVendorPage from './pages/AddVendorPage';
import BusinessAnalyticsPage from './pages/BusinessAnalyticsPage';
// Material Master removed — Parts Master is the single source of truth
import PartsMasterPage from './pages/PartsMasterPage';
import DatabaseHubPage from './pages/DatabaseHubPage';
import RawMaterialMasterPage from './pages/RawMaterialMasterPage';
import VendorPOPage from './pages/VendorPOPage';
import VendorProcurementPage from './pages/VendorProcurementPage';
import VendorDetailPage from './pages/VendorDetailPage';
import VendorEditPage from './pages/VendorEditPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ClientEditPage from './pages/ClientEditPage';
import RecycleBinPage from './pages/RecycleBinPage';
import ComponentsPage from './pages/ComponentsPage';
import AddComponentPage from './pages/AddComponentPage';
import MaterialStockPage from './pages/MaterialStockPage';
import ProcurementPage from './pages/ProcurementPage';
import MgmtProcurementPage from './pages/MgmtProcurementPage';
import FileManagerPage from './pages/FileManagerPage';
import UsersPage from './pages/UsersPage';

// Enterprise Components
import SessionMonitoring from './components/SessionMonitoring';
import CustomRoleBuilder from './components/CustomRoleBuilder';
import ApprovalWorkflowUI from './components/ApprovalWorkflowUI';
import RiskDashboard from './components/RiskDashboard';
import ActivityTimelineView from './components/ActivityTimelineView';
import ChatPage from './pages/ChatPage';

// Loading Component
const LoadingScreen: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#F9FAFB',
    }}
  >
    <CircularProgress />
  </Box>
);

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/**
 * RBAC-aware route guard. Uses canAccessPath with co-admin awareness
 * to enforce visibility rules:
 * - Owner/Co-Owner → full access
 * - Super Admin → no Administration, Enterprise only Risk Dashboard
 * - Admin → no Administration, no Enterprise
 * - User → restricted routes, no Administration, no Enterprise
 */
const RBACRoute: React.FC<{ children: React.ReactNode; path: string }> = ({ children, path }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  const userIsCoAdmin = user.is_co_admin ?? isCoAdmin(user.role, user.is_co_admin);
  if (!canAccessPath(user.role, path, userIsCoAdmin)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Co Admin route guard: Owner/Co-Owner/Super Admin (all main_admin)
const CoAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'main_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Platform Admin route guard: only platform_admin role
const PlatformAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'platform_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const activeCompanyId = getActiveCompanyId();

  // Determine where to redirect after login based on role
  const homeRoute = user?.role === 'platform_admin'
    ? (activeCompanyId ? '/' : '/platform-admin')
    : '/';

  return (
    <ErrorBoundary>
      <Routes>
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to={homeRoute} replace /> : <LoginPage />} 
        />
         <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {user?.role === 'platform_admin' && !activeCompanyId ? <Navigate to="/platform-admin" replace /> : <Layout />}
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ErrorBoundary><ProjectDetailPage /></ErrorBoundary>} />
          <Route path="clients" element={<RBACRoute path="/clients"><ClientsPage /></RBACRoute>} />
          <Route path="clients/:id" element={<RBACRoute path="/clients"><ClientDetailPage /></RBACRoute>} />
          <Route path="clients/:id/edit" element={<RBACRoute path="/clients"><ClientEditPage /></RBACRoute>} />
          <Route path="vendors" element={<RBACRoute path="/vendors"><VendorsPage /></RBACRoute>} />
          <Route path="vendors/add" element={<RBACRoute path="/vendors"><AddVendorPage /></RBACRoute>} />
          <Route path="vendors/:id" element={<RBACRoute path="/vendors"><VendorDetailPage /></RBACRoute>} />
          <Route path="vendors/:id/edit" element={<RBACRoute path="/vendors"><VendorEditPage /></RBACRoute>} />
          <Route path="users" element={<RBACRoute path="/users"><UsersPage /></RBACRoute>} />
          <Route path="vendor-po" element={<RBACRoute path="/vendor-po"><VendorPOPage /></RBACRoute>} />
          <Route path="vendor-procurement" element={<RBACRoute path="/vendor-procurement"><VendorProcurementPage /></RBACRoute>} />
          <Route path="material-stock" element={<RBACRoute path="/material-stock"><MaterialStockPage /></RBACRoute>} />
          <Route path="raw-materials" element={<RBACRoute path="/raw-materials"><RawMaterialMasterPage /></RBACRoute>} />
          <Route path="parts-master" element={<RBACRoute path="/parts-master"><PartsMasterPage /></RBACRoute>} />
          <Route path="components" element={<RBACRoute path="/components"><ComponentsPage /></RBACRoute>} />
          <Route path="database" element={<RBACRoute path="/parts-master"><DatabaseHubPage /></RBACRoute>} />
          <Route path="components/new" element={<RBACRoute path="/components"><AddComponentPage /></RBACRoute>} />
          <Route path="components/:id/edit" element={<RBACRoute path="/components"><AddComponentPage /></RBACRoute>} />
          <Route path="procurement" element={<RBACRoute path="/procurement"><MgmtProcurementPage /></RBACRoute>} />
          <Route path="file-manager" element={<FileManagerPage />} />
          {/* Access Control moved to /platform-admin/access-control */}
          <Route path="access-control" element={<Navigate to="/platform-admin/access-control/users" replace />} />
          <Route path="access-control/*" element={<Navigate to="/platform-admin/access-control/users" replace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="recycle-bin" element={<CoAdminRoute><RecycleBinPage /></CoAdminRoute>} />
          {/* Enterprise routes — RBAC enforced (Super Admin: only risk-dashboard) */}
          <Route path="sessions" element={<RBACRoute path="/sessions"><SessionMonitoring /></RBACRoute>} />
          <Route path="custom-roles" element={<RBACRoute path="/custom-roles"><CustomRoleBuilder /></RBACRoute>} />
          <Route path="approvals" element={<RBACRoute path="/approvals"><ApprovalWorkflowUI /></RBACRoute>} />
          <Route path="risk-dashboard" element={<RBACRoute path="/risk-dashboard"><RiskDashboard /></RBACRoute>} />
          {/* Other routes */}
          <Route path="business-analytics" element={<RBACRoute path="/business-analytics"><BusinessAnalyticsPage /></RBACRoute>} />
          <Route path="analytics" element={<RBACRoute path="/analytics"><BusinessAnalyticsPage /></RBACRoute>} />
          <Route path="activity-timeline" element={<RBACRoute path="/activity-timeline"><ActivityTimelineView /></RBACRoute>} />
          <Route path="messages" element={<ChatPage />} />
        </Route>

        {/* Platform Admin Routes — separate layout, platform_admin role only */}
        <Route
          path="/platform-admin"
          element={
            <ProtectedRoute>
              <PlatformAdminGuard>
                <PlatformAdminLayout />
              </PlatformAdminGuard>
            </ProtectedRoute>
          }
        >
          <Route index element={<CDPLPlatformDashboardPage />} />
          <Route path="companies" element={<PlatformCompaniesPage />} />
          <Route path="company-owners" element={<CDPLCompanyOwnersPage />} />
          <Route path="users" element={<PlatformUsersPage />} />
          <Route path="admins" element={<CDPLAdminsPage />} />
          <Route path="teams" element={<CDPLTeamsPage />} />
          <Route path="activity-logs" element={<CDPLActivityLogsPage />} />
          <Route path="audit-logs" element={<CDPLAuditLogsPage />} />
          <Route path="notifications" element={<CDPLNotificationsPage />} />
          <Route path="reports" element={<PlatformReportsPage />} />
          <Route path="insights" element={<PlatformInsightsPage />} />
          <Route path="subscriptions" element={<CDPLSubscriptionsPage />} />
          <Route path="billing" element={<CDPLBillingPage />} />
          <Route path="integrations" element={<CDPLIntegrationsPage />} />
          <Route path="api-keys" element={<CDPLApiKeysPage />} />
          <Route path="settings" element={<PlatformSettingsPage />} />
          <Route path="recycle-bin" element={<CDPLRecycleBinPage />} />
          {/* Access Control — Company-based user management */}
          <Route path="access-control" element={<PlatformAccessControlPage />} />
          <Route path="access-control/roles" element={<PlatformRolesPermissionsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
};

export default App;
