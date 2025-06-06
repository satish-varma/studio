
import PageHeader from "@/components/shared/PageHeader";
import ActivityLogClientPage from "@/components/admin/ActivityLogClientPage";

export const metadata = {
  title: "Activity Log - StallSync",
};

// Admins only route
export default function ActivityLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Movement Activity Log"
        description="View a detailed history of stock changes across all sites and stalls. (Admins Only)"
      />
      <ActivityLogClientPage />
    </div>
  );
}
