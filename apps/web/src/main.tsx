import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./index.css";
import { ResidentLayout } from "./screens/resident/ResidentLayout";
import { StatusScreen } from "./screens/resident/StatusScreen";
import { SourcesScreen } from "./screens/resident/SourcesScreen";
import { HistoryScreen } from "./screens/resident/HistoryScreen";
import { SettingsScreen } from "./screens/resident/SettingsScreen";
import { FixedLanguage } from "./copy/FixedLanguage";
import { NotFoundScreen, RouteErrorScreen } from "./screens/NotFoundScreen";
import { useCopy } from "./copy/i18n";
import { startSync } from "./offline/sync";

// Staff screens load on demand, so residents' phones don't download them.
const CaptainScreen = lazy(() => import("./screens/captain/CaptainScreen").then((m) => ({ default: m.CaptainScreen })));
const OperatorScreen = lazy(() => import("./screens/operator/OperatorScreen").then((m) => ({ default: m.OperatorScreen })));
const LiveDashboardScreen = lazy(() => import("./screens/lgu/LiveDashboardScreen").then((m) => ({ default: m.LiveDashboardScreen })));
const AllocationScreen = lazy(() => import("./screens/lgu/AllocationScreen").then((m) => ({ default: m.AllocationScreen })));
const PlanScreen = lazy(() => import("./screens/lgu/PlanScreen").then((m) => ({ default: m.PlanScreen })));
const EventRecordScreen = lazy(() => import("./screens/lgu/EventRecordScreen").then((m) => ({ default: m.EventRecordScreen })));

function RouteLoading() {
  const { t } = useCopy();
  return <p role="status" className="p-6 text-ink-soft">{t("app.loading")}</p>;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

// Spec 08: warn in dev if any SMS template no longer fits one GSM-7 segment.
if (import.meta.env.DEV) void import("./copy/sms");

// SPEC: 05 — send the offline queue to the backend (no-op when the backend isn't configured).
startSync();

const router = createBrowserRouter([
  {
    element: <ResidentLayout />,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: "/", element: <StatusScreen /> },
      { path: "/sources", element: <SourcesScreen /> },
      { path: "/history", element: <HistoryScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
    ],
  },
  { path: "/captain", element: <Lazy><CaptainScreen /></Lazy> },
  { path: "/operator", element: <Lazy><OperatorScreen /></Lazy> },
  // LGU / CDRRMO screens are English only; residents and captains keep the language choice.
  { path: "/lgu", element: <FixedLanguage language="english"><Lazy><AllocationScreen /></Lazy></FixedLanguage> },
  { path: "/lgu/event", element: <FixedLanguage language="english"><Lazy><EventRecordScreen /></Lazy></FixedLanguage> },
  { path: "/lgu/live", element: <FixedLanguage language="english"><Lazy><LiveDashboardScreen /></Lazy></FixedLanguage> },
  { path: "/lgu/plan", element: <FixedLanguage language="english"><Lazy><PlanScreen /></Lazy></FixedLanguage> },
  { path: "/admin", element: <Navigate to="/lgu/live" replace /> },
  // Broken or old links (e.g. a mistyped SMS link).
  { path: "*", element: <NotFoundScreen />, errorElement: <RouteErrorScreen /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
