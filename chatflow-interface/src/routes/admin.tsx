import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Dashboard } from "@/components/admin/Dashboard";
import { JobsPanel } from "@/components/admin/JobsPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { WorkflowsPanel } from "@/components/admin/WorkflowsPanel";
import { CaptchaPanel } from "@/components/admin/CaptchaPanel";
import { BrowsersPanel } from "@/components/admin/BrowsersPanel";
import { LogsPanel, ErrorsPanel } from "@/components/admin/LogsPanel";
import { NetworkPanel } from "@/components/admin/NetworkPanel";
import { MetricsPanel } from "@/components/admin/MetricsPanel";
import { SitesPanel } from "@/components/admin/SitesPanel";
import { SecurityPanel } from "@/components/admin/SecurityPanel";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "ChatFlow Admin — System Control Panel" },
      {
        name: "description",
        content:
          "SaaS-level admin panel for full system control, user management, workflow CRUD, captcha solving, and monitoring.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [tab, setTab] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastUpdated(new Date().toLocaleTimeString());
  }, []);

  const renderTab = () => {
    switch (tab) {
      case "dashboard":
        return <Dashboard key={refreshKey} />;
      case "jobs":
        return <JobsPanel key={refreshKey} />;
      case "users":
        return <UsersPanel key={refreshKey} />;
      case "workflows":
        return <WorkflowsPanel key={refreshKey} />;
      case "sites":
        return <SitesPanel key={refreshKey} />;
      case "captcha":
        return <CaptchaPanel key={refreshKey} />;
      case "browsers":
        return <BrowsersPanel key={refreshKey} />;
      case "logs":
        return <LogsPanel key={refreshKey} />;
      case "errors":
        return <ErrorsPanel key={refreshKey} />;
      case "network":
        return <NetworkPanel key={refreshKey} />;
      case "metrics":
        return <MetricsPanel key={refreshKey} />;
      case "security":
        return <SecurityPanel />;
      default:
        return <Dashboard key={refreshKey} />;
    }
  };

  return (
    <AdminLayout
      activeTab={tab}
      onTabChange={setTab}
      onRefresh={handleRefresh}
      lastUpdated={lastUpdated}
    >
      {renderTab()}
    </AdminLayout>
  );
}
