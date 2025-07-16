
import PageHeader from "@/components/shared/PageHeader";
import StaffAttendanceClientPage from "@/components/staff/StaffAttendanceClientPage";

export const metadata = {
  title: "Staff Attendance - StallSync",
};

export default function StaffAttendancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Attendance"
        description="Mark and view daily attendance records for your staff."
      />
      <StaffAttendanceClientPage />
    </div>
  );
}
