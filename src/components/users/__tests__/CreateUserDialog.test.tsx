
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CreateUserDialog from '@/components/users/CreateUserDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Site, Stall } from '@/types';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('@/hooks/use-toast');
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: {
      uid: 'admin-uid-123',
      getIdToken: jest.fn().mockResolvedValue('mock-id-token'),
    },
  })),
  // We don't need other auth functions like onAuthStateChanged for this component's test
}));
jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false })),
  // initializeApp and getApps are often not directly used by leaf components if context handles init
}));

const mockSites: Site[] = [
  { id: 'site1', name: 'Site Alpha', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
  { id: 'site2', name: 'Site Beta', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
];
const mockStalls: Stall[] = [
  { id: 'stall1a', name: 'Stall Alpha-1', siteId: 'site1', stallType: 'Retail Counter', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
  { id: 'stall1b', name: 'Stall Alpha-2', siteId: 'site1', stallType: 'Storage Room', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
  { id: 'stall2a', name: 'Stall Beta-1', siteId: 'site2', stallType: 'Retail Counter', createdAt: '2023-01-01', updatedAt: '2023-01-01' },
];

describe('CreateUserDialog Component', () => {
  let mockOnClose: jest.Mock;
  let mockOnCreateUserFirestoreDoc: jest.Mock;
  let mockToast: jest.Mock;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    mockOnClose = jest.fn();
    mockOnCreateUserFirestoreDoc = jest.fn();
    mockToast = jest.fn();

    (useAuth as jest.Mock).mockReturnValue({
      user: { uid: 'admin-uid-123', role: 'admin', email: 'admin@example.com', displayName: 'Admin User' },
      loading: false,
    });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });

    // Mock global fetch
    mockFetch = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockFetch.mockRestore();
  });

  const renderDialog = (props?: Partial<React.ComponentProps<typeof CreateUserDialog>>) => {
    return render(
      <CreateUserDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreateUserFirestoreDoc={mockOnCreateUserFirestoreDoc}
        sites={mockSites}
        stalls={mockStalls}
        {...props}
      />
    );
  };

  test('renders all form fields correctly by default (staff role)', () => {
    renderDialog();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default site \(for staff\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default stall \(for staff\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/managed sites \(for manager\)/i)).not.toBeInTheDocument();
  });

  test('password visibility toggle works', async () => {
    renderDialog();
    const passwordInput = screen.getByTestId('password-input') as HTMLInputElement;
    const toggleButton = screen.getByLabelText('Show password');

    expect(passwordInput.type).toBe('password');
    fireEvent.click(toggleButton);
    await waitFor(() => expect(passwordInput.type).toBe('text'));
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();
    fireEvent.click(toggleButton);
    await waitFor(() => expect(passwordInput.type).toBe('password'));
  });

  test('shows validation errors for empty required fields', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText(/display name must be at least 2 characters/i)).toBeInTheDocument();
    expect(await screen.findByText(/invalid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least 6 characters/i)).toBeInTheDocument();
    expect(await screen.findByText(/please confirm the password/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('shows validation error for mismatched passwords', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'password456' } });
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('shows managed sites field for "manager" role and validates it', async () => {
    renderDialog();
    // Change role to manager
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /role/i }));
    fireEvent.click(await screen.findByText('Manager'));
    
    await waitFor(() => {
      expect(screen.getByLabelText(/managed sites \(for manager\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/default site \(for staff\)/i)).not.toBeInTheDocument();

    // Attempt submission without selecting managed sites
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Manager User' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'manager@example.com' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'managepass' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'managepass' } });
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText(/managers must be assigned to at least one site/i)).toBeInTheDocument();
  });

  test('successfully creates a staff user', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uid: 'new-staff-uid', email: 'staff@example.com', displayName: 'Staff User' }),
    });
    mockOnCreateUserFirestoreDoc.mockResolvedValueOnce(true);
    renderDialog();

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Staff User' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'staff@example.com' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'staffpass' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'staffpass' } });
    // Select role (already staff by default, but good to be explicit if needed)
    // fireEvent.mouseDown(screen.getByRole('combobox', { name: /role/i }));
    // fireEvent.click(await screen.findByText('Staff'));

    // Select default site
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /default site \(for staff\)/i }));
    fireEvent.click(await screen.findByText('Site Alpha'));
    
    // Select default stall (after site is selected and stalls populate)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Stall Alpha-1' })).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /default stall \(for staff\)/i }));
    fireEvent.click(await screen.findByText('Stall Alpha-1'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    });
    
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/create-user', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'staff@example.com', password: 'staffpass', displayName: 'Staff User' }),
    }));

    await waitFor(() => expect(mockOnCreateUserFirestoreDoc).toHaveBeenCalledWith('new-staff-uid', expect.objectContaining({
      email: 'staff@example.com',
      displayName: 'Staff User',
      role: 'staff',
      defaultSiteId: 'site1',
      defaultStallId: 'stall1a',
    })));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "User Created Successfully" }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('handles API error (email already exists)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Email already exists.', code: 'auth/email-already-exists' }),
    });
    renderDialog();

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Existing User' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'exists@example.com' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'password123' } });
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/the email address exists@example.com is already in use/i)).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "User Creation Failed" }));
    expect(mockOnCreateUserFirestoreDoc).not.toHaveBeenCalled();
  });

  test('handles Firestore document creation failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uid: 'new-user-uid', email: 'firestorefail@example.com', displayName: 'Firestore Fail' }),
    });
    mockOnCreateUserFirestoreDoc.mockResolvedValueOnce(false); // Simulate Firestore failure
    renderDialog();

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Firestore Fail' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'firestorefail@example.com' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockOnCreateUserFirestoreDoc).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Auth User Created, Firestore Failed" }));
    expect(mockOnClose).not.toHaveBeenCalled(); // Dialog might stay open for admin to see the error
  });

  test('cancel button closes the dialog and resets form', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'cancel@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
    // To fully test form reset, you'd need to reopen and check values, or check form.reset was called (if mockable)
  });
});

