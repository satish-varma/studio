
import StaffReportClientPage from "@/components/staff/StaffReportClientPage";

export const metadata = {
  title: "Staff Reports - StallSync",
};

// Admins & Managers only route
export default function StaffReportsPage() {
  return <StaffReportClientPage />;
}
