import type { ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { getStoredToken } from "@/lib/api";
import { AuditPage } from "@/pages/AuditPage";
import { LoginPage } from "@/pages/LoginPage";
import { ModelBrowserPage } from "@/pages/ModelBrowserPage";
import { NovelLibraryPage } from "@/pages/NovelLibraryPage";
import { NovelWorkspacePage } from "@/pages/NovelWorkspacePage";

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getStoredToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/** Legacy `/novels/:id/:Model` → advanced tables. */
function LegacyNovelModelRedirect() {
  const { novelId, childModel, recordId } = useParams();
  if (!novelId || !childModel) {
    return <Navigate to="/novels" replace />;
  }
  const reserved = new Set(["chapters", "characters", "outline", "tasks", "advanced"]);
  if (reserved.has(childModel)) {
    return <Navigate to={`/novels/${novelId}/${childModel}${recordId ? `/${recordId}` : ""}`} replace />;
  }
  const target = recordId
    ? `/novels/${novelId}/advanced/${childModel}/${recordId}`
    : `/novels/${novelId}/advanced/${childModel}`;
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/novels"
        element={
          <RequireAuth>
            <NovelLibraryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/chapters"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/chapters/:chapterId"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/characters"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/outline"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/tasks"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/advanced"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/advanced/:childModel"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/advanced/:childModel/:recordId"
        element={
          <RequireAuth>
            <NovelWorkspacePage />
          </RequireAuth>
        }
      />
      {/* Legacy table-first paths */}
      <Route
        path="/novels/:novelId/:childModel"
        element={
          <RequireAuth>
            <LegacyNovelModelRedirect />
          </RequireAuth>
        }
      />
      <Route
        path="/novels/:novelId/:childModel/:recordId"
        element={
          <RequireAuth>
            <LegacyNovelModelRedirect />
          </RequireAuth>
        }
      />
      <Route
        path="/models"
        element={
          <RequireAuth>
            <ModelBrowserPage />
          </RequireAuth>
        }
      />
      <Route
        path="/models/:model"
        element={
          <RequireAuth>
            <ModelBrowserPage />
          </RequireAuth>
        }
      />
      <Route
        path="/models/:model/:recordId"
        element={
          <RequireAuth>
            <ModelBrowserPage />
          </RequireAuth>
        }
      />
      <Route
        path="/audit"
        element={
          <RequireAuth>
            <AuditPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/novels" replace />} />
    </Routes>
  );
}
