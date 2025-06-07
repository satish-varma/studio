
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/hooks/use-toast');

describe('LoginForm Component', () => {
  let mockSignIn: jest.Mock;
  let mockPush: jest.Mock;
  let mockToast: jest.Mock;

  beforeEach(() => {
    mockSignIn = jest.fn();
    mockPush = jest.fn();
    mockToast = jest.fn();

    (useAuth as jest.Mock).mockReturnValue({ signIn: mockSignIn });
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders email input, password input, and sign-in button', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('allows user to type into email and password fields', () => {
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
  });

  test('shows validation error for empty email', async () => {
    render(<LoginForm />);
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email address./i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('shows validation error for invalid email format', async () => {
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    
    expect(await screen.findByText(/invalid email address./i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('shows validation error for short password', async () => {
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/password must be at least 6 characters./i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('calls signIn with correct credentials and shows loading state on submit', async () => {
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(signInButton);

    // Check for loading state (presence of Loader2 icon, button disabled)
    expect(signInButton).toBeDisabled();
    expect(screen.getByTestId('loader-icon') || screen.getByRole('status', { name: /loading/i}) || screen.getByText((content, element) => element?.tagName.toLowerCase() === 'svg' && element.classList.contains('animate-spin'))).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  test('handles successful sign-in: calls router.push and shows success toast', async () => {
    mockSignIn.mockResolvedValueOnce({ uid: '123', email: 'test@example.com' }); // Simulate successful signIn
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
      expect(mockToast).toHaveBeenCalledWith({
        title: "Login Successful",
        description: "Welcome back!",
      });
    });
  });

  test('handles failed sign-in (invalid credentials): shows error toast', async () => {
    mockSignIn.mockRejectedValueOnce({ code: 'auth/invalid-credential', message: 'Invalid credentials.' });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: "Login Failed",
        description: "Invalid email or password. Please check your credentials and try again.",
        variant: "destructive",
      });
    });
     // Ensure button is re-enabled after attempt
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });

   test('handles failed sign-in (other error): shows error toast with specific message', async () => {
    mockSignIn.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'Network error occurred.' });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: "Login Failed",
        description: "Network error occurred.",
        variant: "destructive",
      });
    });
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });
});

    