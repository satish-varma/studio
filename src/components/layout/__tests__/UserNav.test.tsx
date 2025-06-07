
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserNav } from '@/components/layout/UserNav';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { AppUser } from '@/types';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/hooks/use-toast');

const mockStaffUser: AppUser = {
  uid: 'staff-uid', email: 'staff@example.com', displayName: 'Staff Person', role: 'staff',
  defaultSiteId: null, defaultStallId: null, managedSiteIds: [],
};
const mockManagerUser: AppUser = {
  uid: 'manager-uid', email: 'manager@example.com', displayName: 'Manager Person', role: 'manager',
  defaultSiteId: null, defaultStallId: null, managedSiteIds: ['site1'],
};
const mockAdminUser: AppUser = {
  uid: 'admin-uid', email: 'admin@example.com', displayName: 'Admin Person', role: 'admin',
  defaultSiteId: null, defaultStallId: null, managedSiteIds: [],
};

describe('UserNav Component', () => {
  let mockPush: jest.Mock;
  let mockSignOutUser: jest.Mock;
  let mockToastFn: jest.Mock;
  let useAuthMock: jest.Mock;

  beforeEach(() => {
    mockPush = jest.fn();
    mockSignOutUser = jest.fn();
    mockToastFn = jest.fn();
    useAuthMock = useAuth as jest.Mock;

    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToastFn });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns null if no user is authenticated', () => {
    useAuthMock.mockReturnValue({ user: null, signOutUser: mockSignOutUser });
    const { container } = render(<UserNav />);
    expect(container.firstChild).toBeNull();
  });

  test('renders user avatar and basic info when user is authenticated', async () => {
    useAuthMock.mockReturnValue({ user: mockStaffUser, signOutUser: mockSignOutUser });
    render(<UserNav />);

    const triggerButton = screen.getByTestId('user-nav-trigger');
    expect(triggerButton).toBeInTheDocument();
    expect(screen.getByAltText('Staff Person')).toBeInTheDocument(); // AvatarImage alt

    fireEvent.click(triggerButton); // Open dropdown
    
    expect(await screen.findByTestId('user-nav-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('user-nav-displayname')).toHaveTextContent('Staff Person');
    expect(screen.getByTestId('user-nav-email')).toHaveTextContent('staff@example.com');
    expect(screen.getByTestId('user-nav-role')).toHaveTextContent('Role: staff');
  });

  test('renders initials in AvatarFallback if displayName is missing', async () => {
    const userNoName: AppUser = { ...mockStaffUser, displayName: null, email: 'noname@example.com' };
    useAuthMock.mockReturnValue({ user: userNoName, signOutUser: mockSignOutUser });
    render(<UserNav />);
    
    fireEvent.click(screen.getByTestId('user-nav-trigger'));
    expect(await screen.findByTestId('user-nav-dropdown')).toBeInTheDocument();
    // Default initials "U" or from email prefix
    expect(screen.getByText('N')).toBeInTheDocument(); // Fallback uses first letter of email prefix
  });
  
  test('renders two initials in AvatarFallback if displayName has multiple words', async () => {
    const userTwoNames: AppUser = { ...mockStaffUser, displayName: 'First Last', email: 'fl@example.com' };
    useAuthMock.mockReturnValue({ user: userTwoNames, signOutUser: mockSignOutUser });
    render(<UserNav />);
    
    fireEvent.click(screen.getByTestId('user-nav-trigger'));
    expect(await screen.findByTestId('user-nav-dropdown')).toBeInTheDocument();
    expect(screen.getByText('FL')).toBeInTheDocument();
  });


  test('navigates to profile page on "Profile" click', async () => {
    useAuthMock.mockReturnValue({ user: mockStaffUser, signOutUser: mockSignOutUser });
    render(<UserNav />);
    fireEvent.click(screen.getByTestId('user-nav-trigger'));
    fireEvent.click(await screen.findByTestId('user-nav-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  test('navigates to support page on "Support" click', async () => {
    useAuthMock.mockReturnValue({ user: mockStaffUser, signOutUser: mockSignOutUser });
    render(<UserNav />);
    fireEvent.click(screen.getByTestId('user-nav-trigger'));
    fireEvent.click(await screen.findByTestId('user-nav-support'));
    expect(mockPush).toHaveBeenCalledWith('/support');
  });

  describe('Settings link visibility based on role', () => {
    test('shows Settings link for admin user', async () => {
      useAuthMock.mockReturnValue({ user: mockAdminUser, signOutUser: mockSignOutUser });
      render(<UserNav />);
      fireEvent.click(screen.getByTestId('user-nav-trigger'));
      expect(await screen.findByTestId('user-nav-settings')).toBeInTheDocument();
    });

    test('shows Settings link for manager user', async () => {
      useAuthMock.mockReturnValue({ user: mockManagerUser, signOutUser: mockSignOutUser });
      render(<UserNav />);
      fireEvent.click(screen.getByTestId('user-nav-trigger'));
      expect(await screen.findByTestId('user-nav-settings')).toBeInTheDocument();
    });

    test('does NOT show Settings link for staff user', async () => {
      useAuthMock.mockReturnValue({ user: mockStaffUser, signOutUser: mockSignOutUser });
      render(<UserNav />);
      fireEvent.click(screen.getByTestId('user-nav-trigger'));
      await screen.findByTestId('user-nav-dropdown'); // Ensure dropdown is open
      expect(screen.queryByTestId('user-nav-settings')).not.toBeInTheDocument();
    });

    test('navigates to settings page on "Settings" click (for manager)', async () => {
      useAuthMock.mockReturnValue({ user: mockManagerUser, signOutUser: mockSignOutUser });
      render(<UserNav />);
      fireEvent.click(screen.getByTestId('user-nav-trigger'));
      fireEvent.click(await screen.findByTestId('user-nav-settings'));
      expect(mockPush).toHaveBeenCalledWith('/settings');
    });
  });

  describe('Logout functionality', () => {
    test('calls signOutUser, navigates to login, and shows success toast on logout', async () => {
      useAuthMock.mockReturnValue({ user: mockStaffUser, signOutUser: mockSignOutUser });
      mockSignOutUser.mockResolvedValueOnce(undefined); // Simulate successful sign out
      render(<UserNav />);
      fireEvent.click(screen.getByTestId('user-nav-trigger'));
      fireEvent.click(await screen.findByTestId('user-nav-logout'));

      await waitFor(() => expect(mockSignOutUser).toHaveBeenCalledTimes(1));
      expect(mockPush).toHaveBeenCalledWith('/login');
      expect(mockToastFn).toHaveBeenCalledWith({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
    });

    test('handles error during sign out and shows error toast', async () => {
      useAuthMock.mockReturnValue({ user: mockStaffUser, signOutUser: mockSignOutUser });
      const signOutError = { code: 'auth/network-request-failed', message: 'Network error.' };
      mockSignOutUser.mockRejectedValueOnce(signOutError);
      render(<UserNav />);
      fireEvent.click(screen.getByTestId('user-nav-trigger'));
      fireEvent.click(await screen.findByTestId('user-nav-logout'));

      await waitFor(() => expect(mockSignOutUser).toHaveBeenCalledTimes(1));
      expect(mockPush).not.toHaveBeenCalledWith('/login');
      expect(mockToastFn).toHaveBeenCalledWith({
        title: "Sign Out Error",
        description: `Could not sign out. Error: ${signOutError.message}`,
        variant: "destructive",
      });
    });
  });
});
