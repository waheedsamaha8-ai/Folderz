
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectFolder from './pages/ProjectFolder';
import LetterEditor from './pages/LetterEditor';
import GlobalLoadingBar from './components/GlobalLoadingBar';
import MobileDoubleBackHandler from './components/MobileDoubleBackHandler';
import { api } from './services/api';

// Synchronizes and remembers route so refresh keeps user in the exact same page
const RouteSync: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMounted = React.useRef(false);

  useEffect(() => {
    api.primeCachesFromLocalDB();
    if (!isMounted.current) {
      isMounted.current = true;
      const savedRoute = localStorage.getItem('app_last_active_route');
      // If user landed on '/' upon refresh/reload, but was previously on a deep route, restore it instantly!
      if (location.pathname === '/' && savedRoute && savedRoute !== '/' && !localStorage.getItem('app_user_logged_out')) {
        const projectMatch = savedRoute.match(/\/project\/([^\/]+)/);
        if (projectMatch && projectMatch[1]) {
          const pId = projectMatch[1];
          const savedName = localStorage.getItem(`project_name_${pId}`);
          if (api.isProjectDeleted(pId, savedName || undefined)) {
            localStorage.removeItem('app_last_active_route');
            return;
          }
        }
        navigate(savedRoute, { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname && location.pathname !== '/') {
      const fullPath = location.pathname + location.search;
      const projectMatch = location.pathname.match(/\/project\/([^\/]+)/);
      if (projectMatch && projectMatch[1]) {
        const pId = projectMatch[1];
        const savedName = localStorage.getItem(`project_name_${pId}`);
        if (api.isProjectDeleted(pId, savedName || undefined)) {
          localStorage.removeItem('app_last_active_route');
          return;
        }
      }
      localStorage.setItem('app_last_active_route', fullPath);
    }
  }, [location]);

  return null;
};

// Protect Route Component with Explicit Typing - ensures zero accidental kickouts on refresh
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // If explicitly logged out by user action, force to Home
  if (localStorage.getItem('app_user_logged_out') === 'true') {
    return <Navigate to="/" replace />;
  }

  // Auto-persist session if logged in previously or in guest mode so refresh keeps the user in app
  if (!api.isAuthenticated()) {
    const lastRoute = localStorage.getItem('app_last_active_route');
    const guestMode = localStorage.getItem('guest_mode');
    if (lastRoute || guestMode) {
      localStorage.setItem('app_user_logged_in', 'true');
    } else {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

// Component Wrapper to ensure ProjectFolder re-instantiates cleanly on route changes with key
const ProjectFolderWithKey: React.FC = () => {
  const location = useLocation();
  return <ProjectFolder key={location.pathname} />;
};

const App: React.FC = () => {
  useEffect(() => {
    // Cancel and purge any saved app passcode
    localStorage.removeItem('app_master_passcode_hash');
  }, []);

  return (
    <Router>
      <RouteSync />
      <MobileDoubleBackHandler />
      <GlobalLoadingBar />
      <Routes>
        {/* Dashboard acts as the Gatekeeper. It shows Login & Sign-up if not auth, Content if auth. */}
        <Route path="/" element={<Dashboard />} />
        
        {/* Strictly Protect Deep Links */}
        <Route 
          path="/project/:projectId" 
          element={
            <ProtectedRoute>
              <ProjectFolderWithKey />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/project/:projectId/:folderId" 
          element={
            <ProtectedRoute>
              <ProjectFolderWithKey />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/archive/:folderId" 
          element={
            <ProtectedRoute>
              <ProjectFolderWithKey />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/editor/:projectId/:folderId" 
          element={
            <ProtectedRoute>
              <LetterEditor />
            </ProtectedRoute>
          } 
        />
        
        {/* Force redirect to Home (Login) for any unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
