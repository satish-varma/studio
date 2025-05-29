// This file is automatically used by Next.js as a global loading UI.
// It will be shown when navigating between routes or when suspense boundaries are triggered.
// For more details, see: https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-4 text-lg text-foreground">Loading StallSync...</p>
    </div>
  );
}
