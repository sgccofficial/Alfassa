import { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { ThemeProvider } from "../shared/providers/ThemeProvider";
import { AuthProvider, useAuth } from "../shared/providers/AuthProvider";
import { AppLayout } from "./layout";
import { LoginScreen } from "../features/authentication";
import { Home } from "../features/home";
import { WorkspaceReviewView } from "../features/review";
import { MaterialCanvasView, StandaloneCanvasWindow } from "../features/material";
import { CanvasWorkspaceView } from "../features/canvas";
import { ConceptCanvasView, ConceptsListView, ConceptsMaintenanceView } from "../features/concept";
import { RevisionView } from "../features/revision";
import { SettingsView } from "../features/settings";
import { ComingSoon } from "../shared/components/ComingSoon";

// Route redirects so material review goes directly to material screen
function MaterialReviewRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/material/${id}`} replace />;
}

function ReviewItemRedirect() {
  const { materialId } = useParams<{ materialId: string }>();
  return <Navigate to={`/material/${materialId}`} replace />;
}

// Auth Guard Component
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  if (!user) {
    return <LoginScreen />;
  }
  
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Dedicated Fullscreen Popout Canvas Window Route */}
            <Route path="/canvas/popout/:id" element={<RequireAuth><StandaloneCanvasWindow /></RequireAuth>} />

            <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
              {/* Core Feature Routes */}
              <Route index element={<Home />} />
              <Route path="canvas" element={<CanvasWorkspaceView />} />
              <Route path="canvas/:id" element={<CanvasWorkspaceView />} />
              <Route path="concepts" element={<ConceptsListView />} />
              <Route path="knowledge" element={<Navigate to="/concepts" replace />} />
              <Route path="review" element={<WorkspaceReviewView />} />
              <Route path="review/:materialId" element={<ReviewItemRedirect />} />
              <Route path="search" element={<ComingSoon title="Search Engine" />} />
              <Route path="folders" element={<ComingSoon title="Folders" />} />
              <Route path="collections" element={<ComingSoon title="Collections" />} />
              <Route path="projects" element={<ComingSoon title="Projects" />} />
              <Route path="graph" element={<ComingSoon title="Knowledge Graph" />} />
              <Route path="revision" element={<RevisionView />} />
              <Route path="explore" element={<ComingSoon title="Explore" />} />
              <Route path="activity" element={<ComingSoon title="Activity Feed" />} />
              <Route path="favorites" element={<ComingSoon title="Favorites" />} />
              <Route path="settings" element={<SettingsView />} />
              <Route path="settings/concepts-maintenance" element={<ConceptsMaintenanceView />} />
              
              {/* Entity Detail Routes */}
              <Route path="material/:id" element={<MaterialCanvasView />} />
              <Route path="material/:id/canvas" element={<CanvasWorkspaceView />} />
              <Route path="material/:id/review" element={<MaterialReviewRedirect />} />
              <Route path="concept/:id" element={<ConceptCanvasView />} />
              
              {/* Fallback */}
              <Route path="*" element={<ComingSoon title="404 - Not Found" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}


