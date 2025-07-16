
import PageHeader from "@/components/shared/PageHeader";
import StaffActivityLogClientPage from "@/components/staff/StaffActivityLogClientPage";

export const metadata = {
  title: "Staff Activity Log - StallSync",
};

export default function StaffActivityLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Activity Log"
        description="View a history of attendance, advances, and profile changes for staff members."
      />
      <StaffActivityLogClientPage />
    </div>
  );
}
