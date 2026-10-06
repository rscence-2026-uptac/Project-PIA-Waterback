import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./index.css";
import { ResidentLayout } from "./screens/resident/ResidentLayout";
import { StatusScreen } from "./screens/resident/StatusScreen";
import { SourcesScreen } from "./screens/resident/SourcesScreen";
import { HistoryScreen } from "./screens/resident/HistoryScreen";
import { SettingsScreen } from "./screens/resident/SettingsScreen";
import { CaptainScreen } from "./screens/captain/CaptainScreen";
import { OperatorScreen } from "./screens/operator/OperatorScreen";
import { AdminScreen } from "./screens/admin/AdminScreen";

const router = createBrowserRouter([
  {
    element: <ResidentLayout />,
    children: [
      { path: "/", element: <StatusScreen /> },
      { path: "/sources", element: <SourcesScreen /> },
      { path: "/history", element: <HistoryScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
    ],
  },
  { path: "/captain", element: <CaptainScreen /> },
  { path: "/operator", element: <OperatorScreen /> },
  { path: "/admin", element: <AdminScreen /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
