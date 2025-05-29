
import SitesClientPage from "@/components/admin/SitesClientPage";

export const metadata = {
  title: "Manage Sites - StallSync",
};

// Admins only route - further protection should be via security rules & auth context checks in client component
export default function ManageSitesPage() {
  return <SitesClientPage />;
}
