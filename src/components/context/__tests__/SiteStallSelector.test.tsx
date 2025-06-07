
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SiteStallSelector from '@/components/context/SiteStallSelector';
import { useAuth } from '@/contexts/AuthContext';
import type { Site, Stall, AppUser } from '@/types';

// --- Firebase & Firestore Mocks ---
const mockOnSnapshot = jest.fn();
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((db, path) => ({ path, type: 'collectionRef' })),
  query: jest.fn((collectionRef, ...constraints) => ({ collectionRef, constraints, type: 'queryRef' })),
  where: jest.fn((fieldPath, opStr, value) => ({ fieldPath, opStr, value, type: 'whereConstraint' })),
  onSnapshot: jest.fn((queryOrDoc, callback, errorCallback) => mockOnSnapshot(queryOrDoc, callback, errorCallback)),
}));
// --- End Firebase Mocks ---

jest.mock('@/contexts/AuthContext');

const mockAdminUser: AppUser = {
  uid: 'admin-uid', email: 'admin@example.com', displayName: 'Admin User', role: 'admin',
  managedSiteIds: [], defaultSiteId: null, defaultStallId: null, 
  defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
  defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
  defaultSalesStaffFilter: null,
};
const mockManagerUser: AppUser = {
  uid: 'manager-uid', email: 'manager@example.com', displayName: 'Manager User', role: 'manager',
  managedSiteIds: ['site-1', 'site-2'], defaultSiteId: null, defaultStallId: null,
  defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
  defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
  defaultSalesStaffFilter: null,
};
const mockStaffUser: AppUser = {
  uid: 'staff-uid', email: 'staff@example.com', displayName: 'Staff User', role: 'staff',
  managedSiteIds: [], defaultSiteId: 'site-1', defaultStallId: 'stall-A',
  defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
  defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
  defaultSalesStaffFilter: null,
};

const mockSites: Site[] = [
  { id: 'site-1', name: 'Site Alpha', createdAt: '', updatedAt: '' },
  { id: 'site-2', name: 'Site Beta', createdAt: '', updatedAt: '' },
  { id: 'site-3', name: 'Site Gamma (Admin Only)', createdAt: '', updatedAt: '' },
];
const mockStalls: Stall[] = [
  { id: 'stall-A', name: 'Alpha Counter 1', siteId: 'site-1', stallType: 'Retail', createdAt: '', updatedAt: '' },
  { id: 'stall-B', name: 'Alpha Storage', siteId: 'site-1', stallType: 'Storage', createdAt: '', updatedAt: '' },
  { id: 'stall-C', name: 'Beta Kiosk', siteId: 'site-2', stallType: 'Pop-up', createdAt: '', updatedAt: '' },
];

describe('SiteStallSelector Component', () => {
  let mockSetActiveSite: jest.Mock;
  let mockSetActiveStall: jest.Mock;
  let mockUseAuthReturnValue: any;

  beforeEach(() => {
    mockSetActiveSite = jest.fn();
    mockSetActiveStall = jest.fn();
    
    // Default mock for useAuth
    mockUseAuthReturnValue = {
      user: mockAdminUser,
      activeSiteId: null,
      activeStallId: null,
      setActiveSite: mockSetActiveSite,
      setActiveStall: mockSetActiveStall,
    };
    (useAuth as jest.Mock).mockReturnValue(mockUseAuthReturnValue);

    // Default onSnapshot implementation
    mockOnSnapshot.mockImplementation((queryRef, callback) => {
      let data: any[] = [];
      if (queryRef.collectionRef.path === 'sites') {
        if (mockUseAuthReturnValue.user?.role === 'admin') {
          data = mockSites;
        } else if (mockUseAuthReturnValue.user?.role === 'manager') {
          data = mockSites.filter(s => mockUseAuthReturnValue.user.managedSiteIds.includes(s.id));
        }
      } else if (queryRef.collectionRef.path === 'stalls' && mockUseAuthReturnValue.activeSiteId) {
        data = mockStalls.filter(s => s.siteId === mockUseAuthReturnValue.activeSiteId);
      }
      act(() => callback({ docs: data.map(d => ({ id: d.id, data: () => d })) }));
      return jest.fn(); // unsubscribe
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('does not render if user is null or staff', () => {
    (useAuth as jest.Mock).mockReturnValueOnce({ ...mockUseAuthReturnValue, user: null });
    const { unmount } = render(<SiteStallSelector />);
    expect(screen.queryByTestId('site-stall-selector-container')).not.toBeInTheDocument();
    unmount();

    (useAuth as jest.Mock).mockReturnValueOnce({ ...mockUseAuthReturnValue, user: mockStaffUser });
    render(<SiteStallSelector />);
    expect(screen.queryByTestId('site-stall-selector-container')).not.toBeInTheDocument();
  });

  test('manager sees "Not assigned to any sites" if managedSiteIds is empty', () => {
    (useAuth as jest.Mock).mockReturnValueOnce({
      ...mockUseAuthReturnValue,
      user: { ...mockManagerUser, managedSiteIds: [] },
    });
    render(<SiteStallSelector />);
    expect(screen.getByTestId('manager-no-sites-message')).toBeInTheDocument();
  });

  describe('Admin User', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({ ...mockUseAuthReturnValue, user: mockAdminUser, activeSiteId: null, activeStallId: null });
    });

    test('renders site and stall selectors for admin', async () => {
      render(<SiteStallSelector />);
      await waitFor(() => expect(screen.getByTestId('site-select-trigger')).toBeInTheDocument());
      expect(screen.getByTestId('stall-select-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('stall-select-trigger')).toBeDisabled(); // Stall select disabled initially
    });

    test('populates sites and enables stall selector when a site is chosen', async () => {
      render(<SiteStallSelector />);
      await waitFor(() => expect(screen.queryByText('Loading sites...')).not.toBeInTheDocument());
      
      fireEvent.mouseDown(screen.getByTestId('site-select-trigger'));
      await waitFor(() => expect(screen.getByText(mockSites[0].name)).toBeInTheDocument()); // Site Alpha
      fireEvent.click(screen.getByText(mockSites[0].name));

      await waitFor(() => expect(mockSetActiveSite).toHaveBeenCalledWith(mockSites[0].id));
      // Update context for stall fetching simulation
      (useAuth as jest.Mock).mockReturnValueOnce({ ...mockUseAuthReturnValue, user: mockAdminUser, activeSiteId: mockSites[0].id, activeStallId: null });
      
      await waitFor(() => {
         expect(screen.getByTestId('stall-select-trigger')).not.toBeDisabled();
      });
      fireEvent.mouseDown(screen.getByTestId('stall-select-trigger'));
      await waitFor(() => expect(screen.getByText(`${mockStalls[0].name} (${mockStalls[0].stallType})`)).toBeInTheDocument()); // Alpha Counter 1
    });

    test('calls setActiveStall when admin selects a stall', async () => {
      (useAuth as jest.Mock).mockReturnValueOnce({ ...mockUseAuthReturnValue, user: mockAdminUser, activeSiteId: 'site-1', activeStallId: null });
      render(<SiteStallSelector />);
      await waitFor(() => expect(screen.getByTestId('stall-select-trigger')).not.toBeDisabled());

      fireEvent.mouseDown(screen.getByTestId('stall-select-trigger'));
      const stallOption = await screen.findByText(`${mockStalls[0].name} (${mockStalls[0].stallType})`); // Alpha Counter 1
      fireEvent.click(stallOption);
      
      await waitFor(() => expect(mockSetActiveStall).toHaveBeenCalledWith(mockStalls[0].id));
    });
  });

  describe('Manager User', () => {
     beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({ ...mockUseAuthReturnValue, user: mockManagerUser, activeSiteId: null, activeStallId: null });
    });

    test('renders site selector but no stall selector for manager', async () => {
      render(<SiteStallSelector />);
      await waitFor(() => expect(screen.getByTestId('site-select-trigger')).toBeInTheDocument());
      expect(screen.queryByTestId('stall-select-trigger')).not.toBeInTheDocument();
    });

    test('populates managed sites and shows "All Stalls" badge when site selected', async () => {
      render(<SiteStallSelector />);
      await waitFor(() => expect(screen.queryByText('Loading sites...')).not.toBeInTheDocument());

      fireEvent.mouseDown(screen.getByTestId('site-select-trigger'));
      // Manager user is configured to manage site-1 and site-2
      await waitFor(() => expect(screen.getByText(mockSites[0].name)).toBeInTheDocument()); // Site Alpha
      expect(screen.getByText(mockSites[1].name)).toBeInTheDocument()); // Site Beta
      expect(screen.queryByText(mockSites[2].name)).not.toBeInTheDocument(); // Site Gamma (Admin Only)
      
      fireEvent.click(screen.getByText(mockSites[0].name)); // Select Site Alpha
      
      await waitFor(() => expect(mockSetActiveSite).toHaveBeenCalledWith(mockSites[0].id));
      (useAuth as jest.Mock).mockReturnValueOnce({ ...mockUseAuthReturnValue, user: mockManagerUser, activeSiteId: mockSites[0].id, activeStallId: null }); // Simulate context update
      
      await waitFor(() => expect(screen.getByTestId('manager-all-stalls-badge')).toBeInTheDocument());
      expect(mockSetActiveStall).toHaveBeenCalledWith(null); // Ensure activeStall is set to null for manager
    });
  });

  test('clears active stall when site is changed to "None" by admin', async () => {
    (useAuth as jest.Mock).mockReturnValue({ ...mockUseAuthReturnValue, user: mockAdminUser, activeSiteId: 'site-1', activeStallId: 'stall-A' });
    render(<SiteStallSelector />);
    await waitFor(() => expect(screen.queryByText('Loading sites...')).not.toBeInTheDocument());

    fireEvent.mouseDown(screen.getByTestId('site-select-trigger'));
    fireEvent.click(await screen.findByText('(All Sites / None)'));

    await waitFor(() => expect(mockSetActiveSite).toHaveBeenCalledWith(null));
    expect(mockSetActiveStall).toHaveBeenCalledWith(null); // Because site changed
  });
});

