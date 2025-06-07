
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardPage from '@/app/(app)/dashboard/page';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { getFirestore, collection, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import type { StockItem, SaleTransaction, AppUser } from '@/types';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Firestore
const mockOnSnapshot = jest.fn();
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((db, path) => ({ path, type: 'collectionRef' })),
  query: jest.fn((collectionRef, ...constraints) => ({ collectionRef, constraints, type: 'queryRef' })),
  where: jest.fn((fieldPath, opStr, value) => ({ fieldPath, opStr, value, type: 'whereConstraint' })),
  orderBy: jest.fn((fieldPath, dir) => ({ fieldPath, dir, type: 'orderByConstraint' })),
  onSnapshot: jest.fn((queryOrDoc, callback, errorCallback) => mockOnSnapshot(queryOrDoc, callback, errorCallback)),
  Timestamp: {
    fromDate: jest.fn((date) => ({ toDate: () => date, type: 'timestamp' })), // Mock Timestamp
  },
}));

// Mock Recharts components to prevent rendering errors in tests
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-responsive-container">{children}</div>,
    BarChart: ({ children, data }: { children: React.ReactNode, data: any[] }) => <div data-testid="bar-chart" data-chartdata={JSON.stringify(data)}>{children}</div>,
    Bar: () => <div data-testid="bar-element" />,
    XAxis: () => <div data-testid="xaxis-element" />,
    YAxis: () => <div data-testid="yaxis-element" />,
    CartesianGrid: () => <div data-testid="cartesiangrid-element" />,
    Tooltip: () => <div data-testid="tooltip-element" />,
  };
});
jest.mock('@/components/ui/chart', () => {
  const OriginalUiChartModule = jest.requireActual('@/components/ui/chart');
  return {
    ...OriginalUiChartModule,
    ChartContainer: ({ children, config }: { children: React.ReactNode, config: any }) => <div data-testid="chart-container" data-config={JSON.stringify(config)}>{children}</div>,
    ChartTooltipContent: () => <div data-testid="chart-tooltip-content" />,
  };
});


const mockStockItems: StockItem[] = [
  { id: 'item1', name: 'Apples', category: 'Fruit', quantity: 5, unit: 'kg', price: 2.5, costPrice: 1, lowStockThreshold: 2, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null },
  { id: 'item2', name: 'Bananas', category: 'Fruit', quantity: 10, unit: 'kg', price: 1.5, costPrice: 0.5, lowStockThreshold: 3, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null },
  { id: 'item3', name: 'Milk', category: 'Dairy', quantity: 1, unit: 'ltr', price: 3, costPrice: 1.5, lowStockThreshold: 2, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null }, // Low stock
];

const mockSalesTransactions: SaleTransaction[] = [
  { id: 'sale1', items: [{ itemId: 'item1', name: 'Apples', quantity: 2, pricePerUnit: 2.5, totalPrice: 5 }], totalAmount: 5, transactionDate: subDays(new Date(), 1).toISOString(), staffId: 'staff1', siteId: 'site1', stallId: 'stall1a' },
  { id: 'sale2', items: [{ itemId: 'item2', name: 'Bananas', quantity: 3, pricePerUnit: 1.5, totalPrice: 4.5 }], totalAmount: 4.5, transactionDate: subDays(new Date(), 2).toISOString(), staffId: 'staff1', siteId: 'site1', stallId: 'stall1a' },
  { id: 'sale3', items: [{ itemId: 'item1', name: 'Apples', quantity: 1, pricePerUnit: 2.5, totalPrice: 2.5 }], totalAmount: 2.5, transactionDate: new Date().toISOString(), staffId: 'staff1', siteId: 'site1', stallId: 'stall1a' }, // Today's sale
];


describe('DashboardPage Component', () => {
  let mockPush: jest.Mock;
  let mockUseAuth: jest.Mock;

  beforeEach(() => {
    mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    
    // Default mock for useAuth
    mockUseAuth = useAuth as jest.Mock;
    mockUseAuth.mockReturnValue({
      user: { uid: 'test-user', role: 'admin', displayName: 'Admin User', email: 'admin@example.com' },
      activeSiteId: 'site1',
      activeStallId: 'stall1a',
      activeSite: { id: 'site1', name: 'Test Site One' },
      activeStall: { id: 'stall1a', name: 'Test Stall A', siteId: 'site1', stallType: 'Retail' },
      loading: false,
    });

    // Reset and configure onSnapshot mock for each test
    mockOnSnapshot.mockImplementation((queryRef, successCallback, errorCallback) => {
      if (queryRef.collectionRef.path === 'stockItems') {
        const snapshot = { docs: mockStockItems.map(item => ({ id: item.id, data: () => item })) };
        act(() => successCallback(snapshot));
      } else if (queryRef.collectionRef.path === 'salesTransactions') {
        const snapshot = { docs: mockSalesTransactions.map(sale => ({ id: sale.id, data: () => ({...sale, transactionDate: Timestamp.fromDate(new Date(sale.transactionDate)) }) })) };
        act(() => successCallback(snapshot));
      }
      return jest.fn(); // Return unsubscribe function
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially', () => {
    mockUseAuth.mockReturnValueOnce({ user: null, loading: true, activeSiteId: null, activeStallId: null, activeSite: null, activeStall: null });
    render(<DashboardPage />);
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  test('renders "Select a Site" message for admin if no activeSiteId', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'admin-user', role: 'admin' },
      activeSiteId: null, activeStallId: null, activeSite: null, activeStall: null, loading: false,
    });
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('admin-no-site-alert')).toBeInTheDocument();
    });
  });

  test('renders error message if data fetching fails', async () => {
     mockOnSnapshot.mockImplementation((queryRef, successCallback, errorCallback) => {
      act(() => errorCallback(new Error('Firestore unavailable')));
      return jest.fn();
    });
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('dashboard-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Failed to load stock item data.')).toBeInTheDocument(); // Check specific error part
    });
  });

  test('displays correct dashboard stats', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-total-items').textContent).toBe(mockStockItems.length.toString());
      expect(screen.getByTestId('stat-items-sold-today').textContent).toBe('1'); // Based on mockSalesTransactions
      expect(screen.getByTestId('stat-low-stock-alerts').textContent).toBe('1'); // item3 is low stock
      // Total sales calculation is complex, but we can check if it's a number
      expect(screen.getByTestId('stat-total-sales').textContent).toMatch(/₹\d+\.\d{2}/);
    });
  });

  test('displays "No data" message for sales chart if no sales data', async () => {
    mockOnSnapshot.mockImplementation((queryRef, successCallback) => {
      if (queryRef.collectionRef.path === 'stockItems') successCallback({ docs: mockStockItems.map(item => ({ id: item.id, data: () => item })) });
      else if (queryRef.collectionRef.path === 'salesTransactions') successCallback({ docs: [] }); // No sales
      return jest.fn();
    });
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('no-sales-chart-data')).toBeInTheDocument();
    });
  });

  test('displays "No data" message for low stock items if none are low', async () => {
    const allGoodStockItems = mockStockItems.map(item => ({ ...item, quantity: item.lowStockThreshold + 5 }));
    mockOnSnapshot.mockImplementation((queryRef, successCallback) => {
      if (queryRef.collectionRef.path === 'stockItems') successCallback({ docs: allGoodStockItems.map(item => ({ id: item.id, data: () => item })) });
      else if (queryRef.collectionRef.path === 'salesTransactions') successCallback({ docs: mockSalesTransactions.map(sale => ({ id: sale.id, data: () => ({...sale, transactionDate: Timestamp.fromDate(new Date(sale.transactionDate)) }) })) });
      return jest.fn();
    });
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('no-low-stock-data')).toBeInTheDocument();
    });
  });

  test('displays "No data" message for recent sales if no sales', async () => {
     mockOnSnapshot.mockImplementation((queryRef, successCallback) => {
      if (queryRef.collectionRef.path === 'stockItems') successCallback({ docs: mockStockItems.map(item => ({ id: item.id, data: () => item })) });
      else if (queryRef.collectionRef.path === 'salesTransactions') successCallback({ docs: [] }); // No sales
      return jest.fn();
    });
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('no-recent-sales-data')).toBeInTheDocument();
    });
  });


  test('renders sales chart with data', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
        const chart = screen.getByTestId('bar-chart');
        expect(chart).toBeInTheDocument();
        const chartData = JSON.parse(chart.getAttribute('data-chartdata') || '[]');
        expect(chartData.length).toBeGreaterThan(0); // Should have 7 days of data points
        // Check if at least one data point has sales (based on our mock data)
        expect(chartData.some((dp: {totalSales: number}) => dp.totalSales > 0)).toBe(true);
    });
  });

  test('renders recent sales list', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId(`recent-sale-${mockSalesTransactions[0].id}`)).toBeInTheDocument(); // Most recent by default sort
      expect(screen.getByTestId(`recent-sale-${mockSalesTransactions[1].id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`recent-sale-${mockSalesTransactions[2].id}`)).toBeInTheDocument();
    });
  });

   test('renders low stock items list', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const lowStockItem = mockStockItems.find(item => item.quantity <= item.lowStockThreshold);
      expect(screen.getByTestId(`low-stock-item-${lowStockItem!.id}`)).toBeInTheDocument();
    });
  });

  test('quick action buttons navigate correctly', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-total-items')).toBeInTheDocument(); // Wait for page to load
    });
    
    const recordSaleButton = screen.getByTestId('record-sale-button');
    fireEvent.click(recordSaleButton);
    expect(mockPush).toHaveBeenCalledWith('/sales/record');

    const addNewItemButton = screen.getByTestId('add-new-item-button');
    fireEvent.click(addNewItemButton);
    expect(mockPush).toHaveBeenCalledWith('/items/new');
  });

  test('quick action buttons are disabled appropriately', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'test-user', role: 'staff', displayName: 'Staff User', email: 'staff@example.com' },
      activeSiteId: 'site1', // Site active
      activeStallId: null,   // No specific stall (viewing master stock)
      activeSite: { id: 'site1', name: 'Test Site One' },
      activeStall: null,
      loading: false,
    });
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('stat-total-items')).toBeInTheDocument(); // Wait for page to load
    });
    expect(screen.getByTestId('record-sale-button')).toBeDisabled();
    expect(screen.getByTestId('add-new-item-button')).not.toBeDisabled();
  });

  test('quick action buttons disabled if no site is active', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: { uid: 'test-user', role: 'admin', displayName: 'Admin User', email: 'admin@example.com' },
      activeSiteId: null, 
      activeStallId: null,
      activeSite: null,
      activeStall: null,
      loading: false,
    });
     render(<DashboardPage />);
    // The page shows the "Select a Site" alert in this case, not the main dashboard content.
    // So, we check for the alert, not the buttons themselves.
    await waitFor(() => {
        expect(screen.getByTestId('admin-no-site-alert')).toBeInTheDocument();
    });
    // To be extra sure, query for them - they shouldn't exist if the admin-no-site-alert is shown.
    expect(screen.queryByTestId('record-sale-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-new-item-button')).not.toBeInTheDocument();
  });
});


    