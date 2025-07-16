
import PageHeader from "@/components/shared/PageHeader";
import StaffAttendanceClientPage from "@/components/staff/StaffAttendanceClientPage";

export const metadata = {
  title: "Staff Attendance - StallSync",
};

export default function StaffAttendancePage() {
  return (
    <div className="space-y-6">
      <StaffAttendanceClientPage />
    </div>
  );
}
