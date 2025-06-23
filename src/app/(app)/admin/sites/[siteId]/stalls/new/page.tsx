
import PageHeader from "@/components/shared/PageHeader";
import StallForm from "@/components/admin/StallForm";

export const metadata = {
  title: "Add New Stall - StallSync",
};

// Admins only route
export default function AddNewStallPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add New Stall"
        description="Fill in the details below to add a new stall to this site."
      />
      <StallForm />
    </div>
  );
}
