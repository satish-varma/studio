
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { UserTable } from '@/components/users/UserTable';
import type { AppUser, UserRole, Site, Stall } from '@/types';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
jest.mock('@/hooks/use-toast');

const mockAdminUser: AppUser = {
  uid: 'admin-uid-current', email: 'currentadmin@example.com', displayName: 'Current Admin User', role: 'admin',
  managedSiteIds: [], defaultSiteId: null, defaultStallId: null, createdAt: new Date().toISOString(),
};
const mockStaffUser1: AppUser = {
  uid: 'staff-uid-1', email: 'staff1@example.com', displayName: 'Staff Alpha', role: 'staff',
  defaultSiteId: 'site-A', defaultStallId: 'stall-A1', managedSiteIds: [], createdAt: new Date().toISOString(),
};
const mockManagerUser1: AppUser = {
  uid: 'manager-uid-1', email: 'manager1@example.com', displayName: 'Manager Bravo', role: 'manager',
  managedSiteIds: ['site-A', 'site-B'], defaultSiteId: null, defaultStallId: null, createdAt: new Date().toISOString(),
};
const mockAdminUser2: AppUser = {
  uid: 'admin-uid-2', email: 'admin2@example.com', displayName: 'Admin Charlie', role: 'admin',
  managedSiteIds: [], defaultSiteId: null, defaultStallId: null, createdAt: new Date().toISOString(),
};

const mockUsers: AppUser[] = [mockAdminUser, mockStaffUser1, mockManagerUser1, mockAdminUser2];

const mockSites: Site[] = [
  { id: 'site-A', name: 'Site Alpha', createdAt: '', updatedAt: '' },
  { id: 'site-B', name: 'Site Beta', createdAt: '', updatedAt: '' },
  { id: 'site-C', name: 'Site Charlie', createdAt: '', updatedAt: '' },
];
const mockStalls: Stall[] = [
  { id: 'stall-A1', name: 'Stall Alpha-1 (Retail)', siteId: 'site-A', stallType: 'Retail Counter', createdAt: '', updatedAt: '' },
  { id: 'stall-A2', name: 'Stall Alpha-2 (Storage)', siteId: 'site-A', stallType: 'Storage Room', createdAt: '', updatedAt: '' },
  { id: 'stall-B1', name: 'Stall Beta-1 (Pop-up)', siteId: 'site-B', stallType: 'Pop-up Booth', createdAt: '', updatedAt: '' },
];

describe('UserTable Component', () => {
  let mockOnRoleChange: jest.Mock;
  let mockOnDeleteUser: jest.Mock;
  let mockOnDefaultSiteChange: jest.Mock;
  let mockOnDefaultStallChange: jest.Mock;
  let mockOnManagedSitesChange: jest.Mock;
  let mockToastFn: jest.Mock;

  beforeEach(() => {
    mockOnRoleChange = jest.fn().mockResolvedValue(undefined);
    mockOnDeleteUser = jest.fn().mockResolvedValue(undefined);
    mockOnDefaultSiteChange = jest.fn().mockResolvedValue(undefined);
    mockOnDefaultStallChange = jest.fn().mockResolvedValue(undefined);
    mockOnManagedSitesChange = jest.fn().mockResolvedValue(undefined);
    mockToastFn = jest.fn();

    (useToast as jest.Mock).mockReturnValue({ toast: mockToastFn });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderTable = (usersProp: AppUser[] = mockUsers, currentUserIdProp: string = mockAdminUser.uid) => {
    return render(
      <UserTable
        users={usersProp}
        sites={mockSites}
        stalls={mockStalls}
        onRoleChange={mockOnRoleChange}
        onDeleteUser={mockOnDeleteUser}
        onDefaultSiteChange={mockOnDefaultSiteChange}
        onDefaultStallChange={mockOnDefaultStallChange}
        onManagedSitesChange={mockOnManagedSitesChange}
        currentUserId={currentUserIdProp}
      />
    );
  };

  test('renders "No Users Found" message when users array is empty', () => {
    renderTable([]);
    expect(screen.getByText(/no users found/i)).toBeInTheDocument();
  });

  test('renders table with user data', () => {
    renderTable();
    expect(screen.getByText(mockStaffUser1.displayName!)).toBeInTheDocument();
    expect(screen.getByText(mockManagerUser1.email!)).toBeInTheDocument();
    // Check for role selects or badges
    expect(screen.getAllByRole('combobox', { name: /select role/i })).toHaveLength(mockUsers.length -1); // -1 for current admin
  });

  test('disables role change and delete for the current admin user', () => {
    renderTable();
    const adminUserRow = screen.getByText(mockAdminUser.displayName!).closest('tr');
    expect(adminUserRow).toBeInTheDocument();

    const roleSelectInAdminRow = within(adminUserRow!).getByRole('combobox', { name: /select role/i });
    expect(roleSelectInAdminRow).toBeDisabled();
    
    const actionsButtonInAdminRow = within(adminUserRow!).getByRole('button', { name: /user actions/i });
    expect(actionsButtonInAdminRow).toBeDisabled();
  });

  test('calls onRoleChange when a new role is selected for a different user', async () => {
    renderTable();
    const staffUserRow = screen.getByText(mockStaffUser1.displayName!).closest('tr');
    const roleSelect = within(staffUserRow!).getByRole('combobox', { name: /select role/i });

    fireEvent.mouseDown(roleSelect);
    fireEvent.click(await screen.findByRole('option', { name: /manager/i }));
    
    await waitFor(() => expect(mockOnRoleChange).toHaveBeenCalledWith(mockStaffUser1.uid, 'manager'));
  });

  describe('Staff User Assignments', () => {
    test('calls onDefaultSiteChange when default site is changed for staff', async () => {
      renderTable();
      const staffUserRow = screen.getByText(mockStaffUser1.displayName!).closest('tr');
      const siteSelect = within(staffUserRow!).getByRole('combobox', { name: /default site/i });
      
      fireEvent.mouseDown(siteSelect);
      fireEvent.click(await screen.findByRole('option', { name: 'Site Beta' })); // Select Site Beta (site-B)
      
      await waitFor(() => expect(mockOnDefaultSiteChange).toHaveBeenCalledWith(mockStaffUser1.uid, 'site-B'));
    });

    test('calls onDefaultStallChange when default stall is changed for staff (site must be selected)', async () => {
      renderTable(); // mockStaffUser1 has defaultSiteId: 'site-A'
      const staffUserRow = screen.getByText(mockStaffUser1.displayName!).closest('tr');
      const stallSelect = within(staffUserRow!).getByRole('combobox', { name: /default stall/i });
      
      fireEvent.mouseDown(stallSelect);
      // Stalls for site-A: Stall Alpha-1, Stall Alpha-2
      fireEvent.click(await screen.findByRole('option', { name: 'Stall Alpha-2 (Storage)' }));
      
      await waitFor(() => expect(mockOnDefaultStallChange).toHaveBeenCalledWith(mockStaffUser1.uid, 'stall-A2'));
    });
     test('clears stall selection if staff site is changed to "None"', async () => {
      renderTable();
      const staffUserRow = screen.getByText(mockStaffUser1.displayName!).closest('tr');
      const siteSelect = within(staffUserRow!).getByRole('combobox', { name: /default site/i });
      
      fireEvent.mouseDown(siteSelect);
      fireEvent.click(await screen.findByRole('option', { name: /\(None\)/i })); // Select (None) for site
      
      await waitFor(() => expect(mockOnDefaultSiteChange).toHaveBeenCalledWith(mockStaffUser1.uid, null));
      await waitFor(() => expect(mockOnDefaultStallChange).toHaveBeenCalledWith(mockStaffUser1.uid, null));
    });
  });

  describe('Manager User Assignments (Managed Sites Dialog)', () => {
    test('opens dialog to manage sites for a manager', async () => {
      renderTable();
      const managerUserRow = screen.getByText(mockManagerUser1.displayName!).closest('tr');
      const manageSitesButton = within(managerUserRow!).getByRole('button', { name: /edit managed sites/i });
      fireEvent.click(manageSitesButton);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(`Manage Sites for ${mockManagerUser1.displayName}`)).toBeInTheDocument();
      // Check if initially selected sites are checked
      expect(screen.getByLabelText('Site Alpha')).toBeChecked();
      expect(screen.getByLabelText('Site Beta')).toBeChecked();
      expect(screen.getByLabelText('Site Charlie')).not.toBeChecked();
    });

    test('calls onManagedSitesChange with updated site IDs on save', async () => {
      renderTable();
      const managerUserRow = screen.getByText(mockManagerUser1.displayName!).closest('tr');
      fireEvent.click(within(managerUserRow!).getByRole('button', { name: /edit managed sites/i }));

      const dialog = await screen.findByRole('dialog');
      // Unselect Site Beta, Select Site Charlie
      fireEvent.click(within(dialog).getByLabelText('Site Beta'));
      fireEvent.click(within(dialog).getByLabelText('Site Charlie'));
      
      fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
      
      await waitFor(() => expect(mockOnManagedSitesChange).toHaveBeenCalledWith(
        mockManagerUser1.uid,
        expect.arrayContaining(['site-A', 'site-C']) // Should contain Alpha and Charlie
      ));
      expect(mockOnManagedSitesChange.mock.calls[0][1]).not.toContain('site-B'); // Beta should be removed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // Dialog closes
    });
  });

  describe('Delete User Document Action', () => {
    test('opens confirmation dialog and calls onDeleteUser on confirm', async () => {
      renderTable();
      const staffUserRow = screen.getByText(mockStaffUser1.displayName!).closest('tr');
      const actionsButton = within(staffUserRow!).getByRole('button', { name: /user actions/i });
      fireEvent.click(actionsButton);
      
      const deleteMenuItem = await screen.findByRole('menuitem', { name: /delete user document/i });
      fireEvent.click(deleteMenuItem);

      const alertDialog = await screen.findByRole('alertdialog');
      expect(alertDialog).toBeInTheDocument();
      expect(within(alertDialog).getByText(/are you absolutely sure\?/i)).toBeInTheDocument();
      
      fireEvent.click(within(alertDialog).getByRole('button', { name: /delete user document/i }));
      
      await waitFor(() => expect(mockOnDeleteUser).toHaveBeenCalledWith(mockStaffUser1.uid, mockStaffUser1.displayName));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // Dialog closes
    });
  });

  test('displays correct site/stall names based on maps', () => {
    renderTable();
    const staffUserRow = screen.getByText(mockStaffUser1.displayName!).closest('tr');
    // Staff user assigned to Site Alpha (site-A) and Stall Alpha-1 (stall-A1)
    expect(within(staffUserRow!).getByText('Site Alpha')).toBeInTheDocument(); // From site select
    expect(within(staffUserRow!).getByText('Stall Alpha-1 (Retail Counter)')).toBeInTheDocument(); // From stall select
  });
});

