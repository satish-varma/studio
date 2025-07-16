
import PageHeader from "@/components/shared/PageHeader";
import PayrollClientPage from "@/components/staff/PayrollClientPage";

export const metadata = {
  title: "Staff Payroll - StallSync",
};

export default function StaffPayrollPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Payroll"
        description="Calculate net payable salary for the current month and record payments."
      />
      <PayrollClientPage />
    </div>
  );
}
