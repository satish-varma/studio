
import PageHeader from "@/components/shared/PageHeader";
import SiteForm from "@/components/admin/SiteForm";

export const metadata = {
  title: "Add New Site - StallSync",
};

// Admins only route
export default function AddNewSitePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add New Site"
        description="Fill in the details below to add a new site."
      />
      <SiteForm />
    </div>
  );
}
