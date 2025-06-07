
"use client";

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'; // Added RotateCcw and Home icons

const LOG_PREFIX = "[GlobalError]";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`${LOG_PREFIX} Unhandled error caught by global boundary:`, error);
    if (error.digest) {
      console.error(`${LOG_PREFIX} Error Digest: ${error.digest}`);
    }
    // Example: Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="text-center max-w-md p-8 border border-destructive/50 rounded-lg shadow-lg bg-card">
        <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-destructive mb-4">Oops! Something Went Wrong.</h1>
        <p className="text-muted-foreground mb-2">
          An unexpected error occurred. We apologize for the inconvenience.
        </p>
        <p className="text-muted-foreground mb-6">
          You can try to recover the page or navigate back to the dashboard. If the problem persists, please contact support with the details below.
        </p>
        {error?.message && (
          <details className="mb-6 text-left bg-muted/50 p-3 rounded-md text-sm">
            <summary className="cursor-pointer font-medium text-destructive">Error Details (for debugging)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs">
              Message: {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
              {process.env.NODE_ENV === 'development' && error.stack && `\nStack: ${error.stack}`}
            </pre>
          </details>
        )}
        <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button
            onClick={() => reset()}
            size="lg"
            variant="destructive"
            className="flex-1"
            >
            <RotateCcw className="mr-2 h-4 w-4" /> Try to Recover
            </Button>
            <Button
            onClick={() => window.location.href = '/dashboard'}
            size="lg"
            variant="outline"
            className="flex-1"
            >
            <Home className="mr-2 h-4 w-4" /> Go to Dashboard
            </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
            If you continue to experience issues, please note the error details above and contact our support team.
        </p>
      </div>
    </div>
  );
}
