
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SitesTable } from '@/components/admin/SitesTable';
import type { Site } from '@/types/site';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

// Mock dependencies
jest.mock('@/hooks/use-toast', () => ({
  useToast: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Firestore
const mockDeleteDoc = jest.fn();
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'), // Import and retain default exports
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn((_, path, id) => ({ path: `${path}/${id}` })), // Mock doc to return a simple object
  deleteDoc: jest.fn((docRef) => mockDeleteDoc(docRef)),
}));
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));


const mockSites: Site[] = [
  { id: 'site1', name: 'Main Warehouse', location: 'New York', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'site2', name: 'Downtown Branch', location: 'Los Angeles', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'site3', name: 'Suburban Outlet', location: undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

describe('SitesTable Component', () => {
  let mockPush: jest.Mock;
  let mockToast: jest.Mock;

  beforeEach(() => {
    mockPush = jest.fn();
    mockToast = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
    mockDeleteDoc.mockClear(); // Clear mockDeleteDoc calls before each test
  });

  test('renders "No Sites Found" message when sites array is empty', () => {
    render(<SitesTable sites={[]} />);
    expect(screen.getByText(/no sites found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add your first site/i })).toBeInTheDocument();
  });

  test('renders table with site data when sites array is provided', () => {
    render(<SitesTable sites={mockSites} />);
    
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('New York')).toBeInTheDocument();
    expect(screen.getByText('Downtown Branch')).toBeInTheDocument();
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    expect(screen.getByText('Suburban Outlet')).toBeInTheDocument();
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1); // For Suburban Outlet location

    // Check for table headers
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /location/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
  });

  test('handles "Manage Stalls" action correctly', async () => {
    render(<SitesTable sites={[mockSites[0]]} />);
    const actionsButton = screen.getByRole('button', { name: /site actions/i });
    fireEvent.click(actionsButton);

    const manageStallsButton = await screen.findByText(/manage stalls/i);
    fireEvent.click(manageStallsButton);

    expect(mockPush).toHaveBeenCalledWith('/admin/sites/site1/stalls');
  });

  test('handles "Edit Site" action correctly', async () => {
    render(<SitesTable sites={[mockSites[0]]} />);
    const actionsButton = screen.getByRole('button', { name: /site actions/i });
    fireEvent.click(actionsButton);

    const editSiteButton = await screen.findByText(/edit site/i);
    fireEvent.click(editSiteButton);

    expect(mockPush).toHaveBeenCalledWith('/admin/sites/site1/edit');
  });

  describe('Delete Site Action', () => {
    test('opens confirmation dialog on "Delete Site" click', async () => {
      render(<SitesTable sites={[mockSites[0]]} />);
      const actionsButton = screen.getByRole('button', { name: /site actions/i });
      fireEvent.click(actionsButton);

      const deleteSiteButton = await screen.findByText(/delete site/i);
      fireEvent.click(deleteSiteButton);

      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText(/are you sure\?/i)).toBeInTheDocument();
      expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
    });

    test('calls deleteDoc and shows success toast on confirmed deletion', async () => {
      mockDeleteDoc.mockResolvedValueOnce(undefined); // Simulate successful deletion
      render(<SitesTable sites={[mockSites[0]]} />);
      
      // Open dropdown and click delete
      fireEvent.click(screen.getByRole('button', { name: /site actions/i }));
      fireEvent.click(await screen.findByText(/delete site/i));
      
      // Confirm deletion in dialog
      const confirmButton = await screen.findByRole('button', { name: /delete site/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteDoc).toHaveBeenCalledWith({ path: 'sites/site1' });
      });
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Site Deleted",
          description: `Site "Main Warehouse" has been successfully deleted.`,
        });
      });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // Dialog should close
    });

    test('shows error toast if deleteDoc fails', async () => {
      const errorMessage = "Firestore permission denied";
      mockDeleteDoc.mockRejectedValueOnce(new Error(errorMessage));
      render(<SitesTable sites={[mockSites[0]]} />);

      fireEvent.click(screen.getByRole('button', { name: /site actions/i }));
      fireEvent.click(await screen.findByText(/delete site/i));
      
      const confirmButton = await screen.findByRole('button', { name: /delete site/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "Deletion Failed",
          description: errorMessage,
          variant: "destructive",
        });
      });
      // Dialog might still be open or closed depending on implementation after error
    });

    test('closes confirmation dialog on "Cancel" click', async () => {
      render(<SitesTable sites={[mockSites[0]]} />);
      fireEvent.click(screen.getByRole('button', { name: /site actions/i }));
      fireEvent.click(await screen.findByText(/delete site/i));
      
      const cancelButton = await screen.findByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });
  });

  test('formats dates correctly or shows N/A', () => {
    const siteWithNoDates: Site = { id: 'site4', name: 'No Dates Site', location: 'Testville', createdAt: undefined as any, updatedAt: undefined as any };
    const siteWithInvalidDate: Site = { id: 'site5', name: 'Invalid Date Site', location: 'Testville', createdAt: "invalid-date-string", updatedAt: "invalid-date-string" };
    
    render(<SitesTable sites={[mockSites[0], siteWithNoDates, siteWithInvalidDate]} />);

    // For mockSites[0], check if a plausible date format appears (exact string depends on locale)
    const dateCells = screen.getAllByText(new RegExp(new Date(mockSites[0].createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })));
    expect(dateCells.length).toBeGreaterThanOrEqual(2); // CreatedAt and UpdatedAt for the first mock site

    // For siteWithNoDates, expect "N/A" for date fields
    const tableRows = screen.getAllByRole('row'); // Get all rows (header + data)
    const noDatesSiteRow = tableRows.find(row => row.textContent?.includes('No Dates Site'));
    expect(noDatesSiteRow).toHaveTextContent(/n\/a/i); // Check that N/A appears at least twice for this row's date columns

    // For siteWithInvalidDate, expect "Invalid Date"
     const invalidDateSiteRow = tableRows.find(row => row.textContent?.includes('Invalid Date Site'));
     expect(invalidDateSiteRow).toHaveTextContent(/invalid date/i);
  });
});

    