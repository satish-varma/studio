
import PageHeader from "@/components/shared/PageHeader";
import ItemForm from "@/components/items/ItemForm";

export const metadata = {
  title: "Add New Item - StallSync",
};

export default function AddNewItemPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add New Stock Item"
        description="Fill in the details below to add a new item to your inventory."
      />
      <ItemForm />
    </div>
  );
}
