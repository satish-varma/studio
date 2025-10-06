

import FoodStallReportClientPage from "@/components/foodstall/FoodStallReportClientPage";

export const metadata = {
  title: "Food Stall Financial Reports - StallSync",
};

// Admins & Managers only route
export default function FoodStallReportsPage() {
  return <FoodStallReportClientPage />;
}
