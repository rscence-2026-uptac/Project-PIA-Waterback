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
import { FixedLanguage } from "./copy/FixedLanguage";
import { AllocationScreen } from "./screens/lgu/AllocationScreen";
import { EventRecordScreen } from "./screens/lgu/EventRecordScreen";

// Spec 08: warn in dev if any SMS template no longer fits one GSM-7 segment.
if (import.meta.env.DEV) void import("./copy/sms");

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
  // LGU / CDRRMO screens are English only; residents and captains keep the language choice.
  { path: "/lgu", element: <FixedLanguage language="english"><AllocationScreen /></FixedLanguage> },
  { path: "/lgu/event", element: <FixedLanguage language="english"><EventRecordScreen /></FixedLanguage> },
  { path: "/admin", element: <FixedLanguage language="english"><AdminScreen /></FixedLanguage> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
