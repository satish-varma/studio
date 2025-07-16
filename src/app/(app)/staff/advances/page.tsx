
import PageHeader from "@/components/shared/PageHeader";
import SalaryAdvanceClientPage from "@/components/staff/SalaryAdvanceClientPage";

export const metadata = {
  title: "Salary Advances - StallSync",
};

export default function SalaryAdvancesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Advances"
        description="Record and track salary advances given to staff members."
      />
      <SalaryAdvanceClientPage />
    </div>
  );
}
