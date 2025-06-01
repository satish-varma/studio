
import { LoginForm } from '@/components/auth/LoginForm';
import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 bg-card p-8 rounded-xl shadow-2xl border">
        <div className="text-center">
          <Image
            src="https://placehold.co/100x100.png?text=SS" // Placeholder for StallSync logo
            alt="StallSync Logo"
            data-ai-hint="logo abstract"
            width={80}
            height={80}
            className="mx-auto rounded-lg shadow-md"
          />
          <h1 className="mt-6 text-3xl font-extrabold text-foreground">
            Welcome to StallSync
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to manage your inventory.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Hint: Try staff@example.com, manager@example.com, or admin@example.com with password 'password'.
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
