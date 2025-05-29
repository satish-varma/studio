import PageHeader from "@/components/shared/PageHeader";
import RecordSaleForm from "@/components/sales/RecordSaleForm";

export const metadata = {
  title: "Record Sale - StallSync",
};

export default function RecordSalePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record Sale"
        description="Select items and quantities to record a new transaction."
      />
      <RecordSaleForm />
    </div>
  );
}
