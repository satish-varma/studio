
import PageHeader from "@/components/shared/PageHeader";
import StaffListClientPage from "@/components/staff/StaffListClientPage";

export const metadata = {
  title: "Staff Members - StallSync",
};

export default function StaffListPage() {
  return (
    // The client page will now handle the page header and actions
    <StaffListClientPage />
  );
}
