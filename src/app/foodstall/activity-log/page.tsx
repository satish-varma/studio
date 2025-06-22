
import FoodActivityLogClientPage from "@/components/foodstall/FoodActivityLogClientPage";
import PageHeader from "@/components/shared/PageHeader";

export const metadata = {
  title: "Food Stall Activity Log - StallSync",
};

// Admins & Managers only route
export default function FoodStallActivityLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Activity Log"
        description="View a history of sales and expenses recorded for food stalls."
      />
      <FoodActivityLogClientPage />
    </div>
  );
}
