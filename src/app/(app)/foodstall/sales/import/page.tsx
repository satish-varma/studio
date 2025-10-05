
import GenericFoodSalesImportClientPage from "@/components/foodstall/GenericFoodSalesImportClientPage";
import PageHeader from "@/components/shared/PageHeader";

export const metadata = {
  title: "Import Food Sales - StallSync",
};

export default function GenericFoodSalesImportPage() {
  return (
    <div className="space-y-6">
       <PageHeader
        title="Import Food Sales from CSV"
        description="Upload a CSV file to add or update multiple daily sales records at once."
      />
      <GenericFoodSalesImportClientPage />
    </div>
  );
}
