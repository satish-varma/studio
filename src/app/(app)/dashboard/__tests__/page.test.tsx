
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import DashboardPage from '@/app/(app)/dashboard/page';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { getFirestore, collection, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import type { StockItem, SaleTransaction, AppUser } from '@/types';
import { subDays, startOfDay, endOfDay, format } from 'date-fns'; // Import date-fns

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Firestore
let mockStockItemsSuccessCallback: ((snapshot: any) => void) | null = null;
let mockStockItemsErrorCallback: ((error: Error) => void) | null = null;
let mockSalesSuccessCallback: ((snapshot: any) => void) | null = null;
let mockSalesErrorCallback: ((error: Error) => void) | null = null;
let mockStockUnsubscribe = jest.fn();
let mockSalesUnsubscribe = jest.fn();


jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((db, path) => ({ path, type: 'collectionRef' })),
  query: jest.fn((collectionRef, ...constraints) => ({ collectionRef, constraints, type: 'queryRef' })),
  where: jest.fn((fieldPath, opStr, value) => ({ fieldPath, opStr, value, type: 'whereConstraint' })),
  orderBy: jest.fn((fieldPath, dir) => ({ fieldPath, dir, type: 'orderByConstraint' })),
  onSnapshot: jest.fn((queryRef, successCb, errorCb) => {
    if (queryRef.collectionRef.path === 'stockItems') {
      mockStockItemsSuccessCallback = successCb;
      mockStockItemsErrorCallback = errorCb;
      return mockStockUnsubscribe;
    } else if (queryRef.collectionRef.path === 'salesTransactions') {
      mockSalesSuccessCallback = successCb;
      mockSalesErrorCallback = errorCb;
      return mockSalesUnsubscribe;
    }
    return jest.fn(); // Default unsubscribe
  }),
  Timestamp: {
    fromDate: jest.fn((date) => ({
        toDate: () => date,
        type: 'timestamp',
        seconds: Math.floor(date.getTime() / 1000),
        nanoseconds: (date.getTime() % 1000) * 1000000,
    })),
  },
}));

// Mock Recharts components to prevent rendering errors in tests
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-responsive-container">{children}</div>,
    BarChart: ({ children, data }: { children: React.ReactNode, data: any[] }) => <div data-testid="bar-chart" data-chartdata={data ? JSON.stringify(data) : '[]'}>{children}</div>,
    Bar: (props: any) => <div data-testid="bar-element" data-datakey={props.dataKey} />,
    XAxis: (props: any) => <div data-testid="xaxis-element" data-datakey={props.dataKey} />,
    YAxis: () => <div data-testid="yaxis-element" />,
    CartesianGrid: () => <div data-testid="cartesiangrid-element" />,
    Tooltip: () => <div data-testid="tooltip-element" />,
  };
});
jest.mock('@/components/ui/chart', () => {
  const OriginalUiChartModule = jest.requireActual('@/components/ui/chart');
  return {
    ...OriginalUiChartModule,
    ChartContainer: ({ children, config }: { children: React.ReactNode, config: any }) => <div data-testid="chart-container" data-config={config ? JSON.stringify(config) : '{}'}>{children}</div>,
    ChartTooltipContent: () => <div data-testid="chart-tooltip-content" />,
  };
});

const today = new Date();
const mockAdminUser: AppUser = { uid: 'admin-user', role: 'admin', email: 'admin@test.com', displayName: 'Admin Test', managedSiteIds:[], defaultSiteId: null, defaultStallId: null, defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null, defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null, defaultSalesStaffFilter: null};

const mockStockItems: StockItem[] = [
  { id: 'item1', name: 'Apples', category: 'Fruit', quantity: 5, unit: 'kg', price: 2.5, costPrice: 1, lowStockThreshold: 2, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null },
  { id: 'item2', name: 'Bananas', category: 'Fruit', quantity: 10, unit: 'kg', price: 1.5, costPrice: 0.5, lowStockThreshold: 3, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null },
  { id: 'item3', name: 'Milk', category: 'Dairy', quantity: 1, unit: 'ltr', price: 3, costPrice: 1.5, lowStockThreshold: 2, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null }, // Low stock
  { id: 'item4', name: 'Bread', category: 'Bakery', quantity: 0, unit: 'loaf', price: 2, costPrice: 0.8, lowStockThreshold: 1, lastUpdated: new Date().toISOString(), siteId: 'site1', stallId: 'stall1a', originalMasterItemId: null }, // Out of stock
];

const mockSalesTransactions: SaleTransaction[] = [
  { id: 'sale1', items: [{ itemId: 'item1', name: 'Apples', quantity: 2, pricePerUnit: 2.5, totalPrice: 5 }], totalAmount: 5, transactionDate: subDays(today, 1).toISOString(), staffId: 'staff1', siteId: 'site1', stallId: 'stall1a' },
  { id: 'sale2', items: [{ itemId: 'item2', name: 'Bananas', quantity: 3, pricePerUnit: 1.5, totalPrice: 4.5 }], totalAmount: 4.5, transactionDate: subDays(today, 2).toISOString(), staffId: 'staff1', siteId: 'site1', stallId: 'stall1a' },
  { id: 'sale3', items: [{ itemId: 'item1', name: 'Apples', quantity: 1, pricePerUnit: 2.5, totalPrice: 2.5 }], totalAmount: 2.5, transactionDate: today.toISOString(), staffId: 'staff1', siteId: 'site1', stallId: 'stall1a' }, // Today's sale: 1 item sold
  { id: 'sale4', items: [{ itemId: 'item4', name: 'Bread', quantity: 2, pricePerUnit: 2, totalPrice: 4 }], totalAmount: 4, transactionDate: today.toISOString(), staffId: 'staff2', siteId: 'site1', stallId: 'stall1a' }, // Today's sale: 2 items sold
];


describe('DashboardPage Component Detailed Tests', () => {
  let mockPush: jest.Mock;
  let mockUseAuth: jest.Mock;

  const simulateStockItemsLoad = (items: StockItem[] = mockStockItems) => {
    if (mockStockItemsSuccessCallback) {
      act(() => mockStockItemsSuccessCallback({ docs: items.map(item => ({ id: item.id, data: () => item })) }));
    }
  };
  const simulateSalesLoad = (sales: SaleTransaction[] = mockSalesTransactions) => {
    if (mockSalesSuccessCallback) {
      act(() => mockSalesSuccessCallback({ docs: sales.map(sale => ({ id: sale.id, data: () => ({...sale, transactionDate: Timestamp.fromDate(new Date(sale.transactionDate)) }) })) }));
    }
  };
  const simulateStockItemsError = (error = new Error('Firestore stock error')) => {
    if (mockStockItemsErrorCallback) act(() => mockStockItemsErrorCallback(error));
  };
  const simulateSalesError = (error = new Error('Firestore sales error')) => {
    if (mockSalesErrorCallback) act(() => mockSalesErrorCallback(error));
  };

  beforeEach(() => {
    mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    
    mockUseAuth = useAuth as jest.Mock;
    mockUseAuth.mockReturnValue({
      user: mockAdminUser,
      activeSiteId: 'site1',
      activeStallId: 'stall1a',
      activeSite: { id: 'site1', name: 'Test Site One' },
      activeStall: { id: 'stall1a', name: 'Test Stall A', siteId: 'site1', stallType: 'Retail' },
      loading: false,
    });

    mockStockUnsubscribe.mockClear();
    mockSalesUnsubscribe.mockClear();
    mockStockItemsSuccessCallback = null;
    mockStockItemsErrorCallback = null;
    mockSalesSuccessCallback = null;
    mockSalesErrorCallback = null;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially when auth is loading', () => {
    mockUseAuth.mockReturnValueOnce({ user: null, loading: true, activeSiteId: null, activeStallId: null, activeSite: null, activeStall: null });
    render(<DashboardPage />);
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  test('renders loading state initially when data is loading', async () => {
    render(<DashboardPage />);
    // Don't call simulateStockItemsLoad or simulateSalesLoad yet
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    // Now simulate data load to remove the loading state for other tests
    simulateStockItemsLoad();
    simulateSalesLoad();
    await waitFor(() => expect(screen.queryByTestId('dashboard-loading')).not.toBeInTheDocument());
  });


  test('renders "Select a Site" message for admin if no activeSiteId', async () => {
    mockUseAuth.mockReturnValueOnce({
      user: mockAdminUser,
      activeSiteId: null, activeStallId: null, activeSite: null, activeStall: null, loading: false,
    });
    render(<DashboardPage />);
    await waitFor(() => {
        expect(screen.getByTestId('admin-no-site-alert')).toBeInTheDocument();
    });
  });

  test('renders error message if stock item data fetching fails', async () => {
    render(<DashboardPage />);
    simulateStockItemsError();
    simulateSalesLoad(); // Sales load fine
    await waitFor(() => {
        expect(screen.getByTestId('dashboard-error-alert')).toBeInTheDocument();
        expect(screen.getByText(/Failed to load stock item data./i)).toBeInTheDocument();
    });
  });

  test('renders error message if sales transaction data fetching fails', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad(); // Stock loads fine
    simulateSalesError();
    await waitFor(() => {
        expect(screen.getByTestId('dashboard-error-alert')).toBeInTheDocument();
        expect(screen.getByText(/Failed to load sales transaction data./i)).toBeInTheDocument();
    });
  });
  
  test('displays correct dashboard stats based on mock data', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad();

    await waitFor(() => {
      expect(screen.getByTestId('stat-total-items').textContent).toBe(mockStockItems.length.toString());
      // Items sold today: sale3 (1 Apple) + sale4 (2 Bread) = 3 items
      expect(screen.getByTestId('stat-items-sold-today').textContent).toBe('3');
      // Low stock alerts: item3 (Milk, qty 1 <= threshold 2)
      expect(screen.getByTestId('stat-low-stock-alerts').textContent).toBe('1');
      // Total sales last 7 days: sale1 (5) + sale2 (4.5) + sale3 (2.5) + sale4 (4) = 16
      expect(screen.getByTestId('stat-total-sales').textContent).toBe('₹16.00');
    });
  });

  test('displays "No data" for sales chart if no sales transactions', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad([]); // No sales
    await waitFor(() => {
        expect(screen.getByTestId('no-sales-chart-data')).toBeInTheDocument();
    });
  });

  test('displays "No data" for low stock items if all items are above threshold', async () => {
    const allGoodStockItems = mockStockItems.map(item => ({ ...item, quantity: item.lowStockThreshold + 5 }));
    render(<DashboardPage />);
    simulateStockItemsLoad(allGoodStockItems);
    simulateSalesLoad();
    await waitFor(() => {
        expect(screen.getByTestId('no-low-stock-data')).toBeInTheDocument();
    });
  });

  test('displays "No data" for recent sales if no sales transactions', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad([]); // No sales
    await waitFor(() => {
        expect(screen.getByTestId('no-recent-sales-data')).toBeInTheDocument();
    });
  });

  test('renders sales chart with aggregated data for the last 7 days', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad(); // Uses mockSalesTransactions with today's and past sales

    await waitFor(() => {
        const chart = screen.getByTestId('bar-chart');
        expect(chart).toBeInTheDocument();
        const chartData = JSON.parse(chart.getAttribute('data-chartdata') || '[]');
        expect(chartData.length).toBe(7); // Should have 7 days of data points

        const todayFormatted = format(today, 'yyyy-MM-dd');
        const todayDataPoint = chartData.find((dp: any) => dp.date === todayFormatted);
        // Today's sales: sale3 (2.5) + sale4 (4) = 6.5
        expect(todayDataPoint?.totalSales).toBe(6.5);

        const yesterdayFormatted = format(subDays(today, 1), 'yyyy-MM-dd');
        const yesterdayDataPoint = chartData.find((dp: any) => dp.date === yesterdayFormatted);
        expect(yesterdayDataPoint?.totalSales).toBe(5); // sale1
    });
  });

  test('renders recent sales list correctly', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad(); // mockSalesTransactions is already ordered with today's sales last (most recent)
    await waitFor(() => {
      // Sale3 and Sale4 are today's sales, Sale1 is yesterday's.
      // The component sorts them by date descending and takes top 3.
      expect(screen.getByTestId(`recent-sale-${mockSalesTransactions[2].id}`)).toBeInTheDocument(); // sale3 (today)
      expect(screen.getByTestId(`recent-sale-${mockSalesTransactions[3].id}`)).toBeInTheDocument(); // sale4 (today)
      expect(screen.getByTestId(`recent-sale-${mockSalesTransactions[0].id}`)).toBeInTheDocument(); // sale1 (yesterday)
      expect(screen.queryByTestId(`recent-sale-${mockSalesTransactions[1].id}`)).not.toBeInTheDocument(); // sale2 (2 days ago) should not be there if only 3 shown
    });
  });

   test('renders low stock items list correctly', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad(); // item3 (Milk) is low stock
    simulateSalesLoad();
    await waitFor(() => {
      expect(screen.getByTestId(`low-stock-item-${mockStockItems[2].id}`)).toBeInTheDocument();
      // Item4 is out of stock, should also be considered low stock. It is also low stock by threshold.
      expect(screen.getByTestId(`low-stock-item-${mockStockItems[3].id}`)).toBeInTheDocument();
    });
  });

  test('quick action buttons navigate correctly', async () => {
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad();
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

  test('record sale button is disabled if no activeStallId, add item button enabled if activeSiteId', async () => {
    mockUseAuth.mockReturnValueOnce({
      ...mockUseAuth(), // This will spread the default mock function, not its return value
      user: { ...mockAdminUser, role: 'staff' }, // Simulate staff to easily control stall context
      activeSiteId: 'site1', // Has active site
      activeStallId: null,   // No specific stall (viewing master stock)
      activeSite: { id: 'site1', name: 'Test Site One' },
      activeStall: null,
      loading: false,
    });
    render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad();
    await waitFor(() => {
      expect(screen.getByTestId('stat-total-items')).toBeInTheDocument();
    });
    expect(screen.getByTestId('record-sale-button')).toBeDisabled();
    expect(screen.getByTestId('add-new-item-button')).not.toBeDisabled();
  });

  test('quick action buttons are disabled if no activeSiteId', async () => {
    mockUseAuth.mockReturnValueOnce({
      ...mockUseAuth(),
      user: mockAdminUser,
      activeSiteId: null, 
      activeSite: null,
      activeStallId: null,
      activeStall: null,
      loading: false,
    });
    render(<DashboardPage />);
    // This will show the 'admin-no-site-alert' instead of the main dashboard
    await waitFor(() => {
        expect(screen.getByTestId('admin-no-site-alert')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('record-sale-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-new-item-button')).not.toBeInTheDocument();
  });

  test('unsubscribes from Firestore listeners on unmount', async () => {
    const { unmount } = render(<DashboardPage />);
    simulateStockItemsLoad();
    simulateSalesLoad();
    await waitFor(() => expect(screen.getByTestId('stat-total-items')).toBeInTheDocument()); // Ensure listeners are set up

    unmount();
    expect(mockStockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockSalesUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
