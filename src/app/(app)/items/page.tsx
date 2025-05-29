import ItemsClientPage from "@/components/items/ItemsClientPage";

export const metadata = {
  title: "Stock Items - StallSync",
};

export default function ItemsPage() {
  // Server component, can fetch initial data if needed and pass to client component
  // For now, ItemsClientPage handles its own (mock) data
  return <ItemsClientPage />;
}
