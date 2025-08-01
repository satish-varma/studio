
import FoodStallReportClientPage from "@/components/foodstall/FoodStallReportClientPage";
import PageHeader from "@/components/shared/PageHeader";

export const metadata = {
  title: "Food Stall Reports - StallSync",
};

export default function FoodStallReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Financial Report"
        description="Analyze your food stall's performance with detailed sales, expense, and profit reports."
      />
      <FoodStallReportClientPage />
    </div>
  );
}

    