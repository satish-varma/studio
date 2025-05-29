
// This file is automatically used by Next.js to handle errors globally.
// For more details, see: https://nextjs.org/docs/app/building-your-application/routing/error-handling
"use client"; 

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    // In a real production app, you'd use something like Sentry, LogRocket, etc.
    console.error("Global Error Boundary Caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="text-center max-w-md p-8 border border-destructive/50 rounded-lg shadow-lg bg-card">
        <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-destructive mb-4">Oops! Something went wrong.</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. We've been notified and are looking into it.
          Please try again later.
        </p>
        {error?.message && (
          <details className="mb-6 text-left bg-muted/50 p-3 rounded-md text-sm">
            <summary className="cursor-pointer font-medium text-destructive">Error Details (for debugging)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
              {/* In development, you might want to show error.stack, but be cautious in production */}
            </pre>
          </details>
        )}
        <Button
          onClick={
            // Attempt to recover by trying to re-render the segment
            () => reset()
          }
          size="lg"
          variant="destructive"
        >
          Try again
        </Button>
        <Button
          onClick={() => window.location.href = '/dashboard'}
          size="lg"
          variant="outline"
          className="ml-4"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
