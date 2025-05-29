import SalesHistoryClientPage from "@/components/sales/SalesHistoryClientPage";

export const metadata = {
  title: "Sales History - StallSync",
};

export default function SalesHistoryPage() {
  // Server component, can fetch initial data if needed and pass to client component
  // For now, SalesHistoryClientPage handles its own (mock) data
  return <SalesHistoryClientPage />;
}
