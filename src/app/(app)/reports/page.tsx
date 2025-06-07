
import SalesSummaryReportClientPage from "@/components/reports/SalesSummaryReportClientPage";

export const metadata = {
  title: "Reports - StallSync",
};

// Admins & Managers only route (further protected by AuthContext checks in client component)
export default function ReportsPage() {
  return (
    <SalesSummaryReportClientPage />
  );
}
