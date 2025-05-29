
import SalesHistoryClientPage from "@/components/sales/SalesHistoryClientPage";

export const metadata = {
  title: "Sales History - StallSync",
};

export default function SalesHistoryPage() {
  // Data fetching and management are handled within SalesHistoryClientPage using client-side Firebase.
  return <SalesHistoryClientPage />;
}
