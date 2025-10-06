
import FoodStallPivotReportClientPage from "@/components/foodstall/FoodStallPivotReportClientPage";
import PageHeader from "@/components/shared/PageHeader";

export const metadata = {
  title: "Food Stall Pivot Report - StallSync",
};

// Admins & Managers only route
export default function FoodStallPivotReportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Pivot Report"
        description="Analyze daily sales totals across different stalls in a pivot-table format."
      />
      <FoodStallPivotReportClientPage />
    </div>
  );
}
