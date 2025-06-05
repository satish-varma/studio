
import PageHeader from "@/components/shared/PageHeader";
import SalesSummaryReportClientPage from "@/components/reports/SalesSummaryReportClientPage";

export const metadata = {
  title: "Reports - StallSync",
};

// Admins & Managers only route (further protected by AuthContext checks in client component)
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & Inventory Reports"
        description="Analyze your sales data, profit margins, and inventory performance."
      />
      <SalesSummaryReportClientPage />
    </div>
  );
}
