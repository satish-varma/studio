
import ItemsClientPage from "@/components/items/ItemsClientPage";

export const metadata = {
  title: "Stock Items - StallSync",
};

export default function ItemsPage() {
  // Data fetching and management are handled within ItemsClientPage using client-side Firebase.
  return <ItemsClientPage />;
}
