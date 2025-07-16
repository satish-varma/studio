
import PageHeader from "@/components/shared/PageHeader";
import StaffListClientPage from "@/components/staff/StaffListClientPage";

export const metadata = {
  title: "Staff List - StallSync",
};

export default function StaffListPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Members"
        description="View and manage detailed profiles for all staff members."
      />
      <StaffListClientPage />
    </div>
  );
}
