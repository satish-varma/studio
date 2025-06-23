import StallsClientPage from "@/components/admin/StallsClientPage";

// Admins only route - further protection is handled by client component.
// This server component simply renders the client page.
// The problematic `generateMetadata` function has been removed to resolve build errors.
// The document title will be set dynamically within the client component.
export default function ManageStallsPage() {
  // The client component will get the siteId from the URL using the useParams hook.
  // This parent component doesn't need to handle props.
  return <StallsClientPage />;
}
