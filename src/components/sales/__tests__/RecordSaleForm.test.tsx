
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import RecordSaleForm from '@/components/sales/RecordSaleForm';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { logStockMovement } from '@/lib/stockLogger';
import type { StockItem } from '@/types';

// --- Firebase & Firestore Mocks ---
const mockRunTransaction = jest.fn();
const mockOnSnapshot = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn(); // For any ad-hoc getDocs if needed, though onSnapshot is primary here

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'), // Import and retain default exports
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((db, path) => ({ path, type: 'collectionRef' })),
  doc: jest.fn((dbOrCollectionRef, pathOrId, ...pathSegments) => {
    if (typeof pathOrId === 'string' && pathSegments.length > 0) {
      // This case is for doc(db, collectionName, docId)
      return { path: `${pathOrId}/${pathSegments.join('/')}`, id: pathSegments[pathSegments.length - 1], type: 'docRef' };
    }
    // This case is for doc(collectionRef, docId) or doc(db, path)
    return { path: pathOrId, id: pathOrId, type: 'docRef' };
  }),
  onSnapshot: jest.fn((queryOrDoc, callback, errorCallback) => mockOnSnapshot(queryOrDoc, callback, errorCallback)),
  runTransaction: jest.fn((db, callback) => mockRunTransaction(db, callback)),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date() })),
    fromDate: jest.fn((date) => ({ toDate: () => date })),
  },
  query: jest.fn((collectionRef, ...constraints) => ({ collectionRef, constraints, type: 'queryRef' })),
  where: jest.fn((fieldPath, opStr, value) => ({ fieldPath, opStr, value, type: 'whereConstraint' })),
  getDoc: jest.fn((docRef) => mockGetDoc(docRef)),
  getDocs: jest.fn((queryRef) => mockGetDocs(queryRef)),
}));
// --- End Firebase Mocks ---

jest.mock('@/contexts/AuthContext');
jest.mock('@/hooks/use-toast');
jest.mock('@/lib/stockLogger');


const mockUser = {
  uid: 'test-staff-uid',
  email: 'staff@example.com',
  displayName: 'Test Staff',
  role: 'staff',
};

const mockAvailableItems: StockItem[] = [
  { id: 'item1', name: 'Apple', category: 'Fruit', quantity: 10, unit: 'pcs', price: 1.00, costPrice: 0.5, lowStockThreshold: 2, lastUpdated: '', siteId: 'site1', stallId: 'stall1a', originalMasterItemId: 'master-apple' },
  { id: 'item2', name: 'Banana', category: 'Fruit', quantity: 5, unit: 'pcs', price: 0.50, costPrice: 0.2, lowStockThreshold: 1, lastUpdated: '', siteId: 'site1', stallId: 'stall1a', originalMasterItemId: 'master-banana' },
  { id: 'item3', name: 'Milk', category: 'Dairy', quantity: 0, unit: 'ltr', price: 2.00, costPrice: 1.0, lowStockThreshold: 1, lastUpdated: '', siteId: 'site1', stallId: 'stall1a', originalMasterItemId: 'master-milk' }, // Out of stock
];

describe('RecordSaleForm Component', () => {
  let mockToastFn: jest.Mock;

  beforeEach(() => {
    mockToastFn = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      activeSiteId: 'site1',
      activeStallId: 'stall1a',
    });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToastFn });
    (logStockMovement as jest.Mock).mockResolvedValue(undefined);

    // Reset and configure onSnapshot mock for each test
    mockOnSnapshot.mockImplementation((queryOrDoc, callback) => {
      // Simulate fetching available items
      const snapshot = {
        docs: mockAvailableItems.map(item => ({
          id: item.id,
          data: () => item,
        })),
      };
      callback(snapshot);
      return jest.fn(); // Return unsubscribe function
    });

    mockRunTransaction.mockImplementation(async (db, updateFunction) => {
        // Simulate a successful transaction by default
        const transaction = {
            get: jest.fn(async (docRef) => {
                const item = mockAvailableItems.find(i => i.id === docRef.id);
                if (item) return { exists: () => true, data: () => item, ref: docRef };
                if (item?.originalMasterItemId && docRef.id === item.originalMasterItemId) { // Master item
                     const master = mockAvailableItems.find(m => m.id === item.originalMasterItemId);
                     if (master) return { exists: () => true, data: () => master, ref: docRef };
                }
                return { exists: () => false, data: () => null, ref: docRef };
            }),
            update: jest.fn(),
            set: jest.fn(),
        };
        await updateFunction(transaction);
        return Promise.resolve();
    });
     // Mock getDoc for post-sale logging re-fetch
    mockGetDoc.mockImplementation(async (docRef) => {
        const item = mockAvailableItems.find(i => i.id === docRef.id);
        if (item) return { exists: () => true, data: () => item };
        return { exists: () => false };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders initial form with one empty item row', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.getByTestId('sale-item-row-0')).toBeInTheDocument());
    expect(screen.getByText('Total: ₹0.00')).toBeInTheDocument();
  });

  test('shows alert if no site/stall context', () => {
    (useAuth as jest.Mock).mockReturnValueOnce({ user: mockUser, activeSiteId: null, activeStallId: null });
    render(<RecordSaleForm />);
    expect(screen.getByText(/Site & Stall Context Required/i)).toBeInTheDocument();
  });

  test('shows loading indicator for items initially', () => {
    mockOnSnapshot.mockImplementation(() => jest.fn()); // Prevent immediate data callback
    render(<RecordSaleForm />);
    expect(screen.getByTestId('loading-items-indicator')).toBeInTheDocument();
  });

  test('shows "no items available" alert if stall has no stock', async () => {
    mockOnSnapshot.mockImplementation((queryOrDoc, callback) => {
      callback({ docs: [] }); // No items
      return jest.fn();
    });
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.getByTestId('no-items-alert')).toBeInTheDocument());
  });

  test('populates item details when an item is selected', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());
    
    const itemSelect = screen.getByTestId('item-select-0');
    fireEvent.mouseDown(itemSelect.querySelector('button')!); // Open select
    
    const appleOption = await screen.findByText(/Apple \(Stock: 10\)/i);
    fireEvent.click(appleOption);

    await waitFor(() => {
        const priceInput = screen.getByTestId('price-input-0') as HTMLInputElement;
        expect(priceInput.value).toBe(mockAvailableItems[0].price.toString());
        const quantityInput = screen.getByTestId('quantity-input-0') as HTMLInputElement;
        expect(quantityInput.value).toBe('1');
    });
  });

  test('allows adding and removing item rows', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());

    expect(screen.getAllByTestId(/sale-item-row-/)).toHaveLength(1);
    const addButton = screen.getByTestId('add-another-item-button');
    fireEvent.click(addButton);
    expect(screen.getAllByTestId(/sale-item-row-/)).toHaveLength(2);

    const removeButtonRow0 = screen.getByTestId('remove-item-button-0');
    fireEvent.click(removeButtonRow0);
    expect(screen.getAllByTestId(/sale-item-row-/)).toHaveLength(1);
    // Remove button for the last row should be disabled
    expect(screen.getByTestId('remove-item-button-0')).toBeDisabled();
  });

  test('updates total amount dynamically', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());

    // Select Apple (price 1.00)
    fireEvent.mouseDown(screen.getByTestId('item-select-0').querySelector('button')!);
    fireEvent.click(await screen.findByText(/Apple \(Stock: 10\)/i));

    // Change quantity to 3
    const quantityInput0 = screen.getByTestId('quantity-input-0');
    fireEvent.change(quantityInput0, { target: { value: '3' } });
    await waitFor(() => expect(screen.getByTestId('total-sale-amount')).toHaveTextContent('Total: ₹3.00'));

    // Add another item
    fireEvent.click(screen.getByTestId('add-another-item-button'));
    
    // Select Banana (price 0.50) for the second row
    const itemSelect1 = screen.getByTestId('item-select-1');
    fireEvent.mouseDown(itemSelect1.querySelector('button')!);
    fireEvent.click(await screen.findByText(/Banana \(Stock: 5\)/i));
    
    // Change quantity of banana to 2
    const quantityInput1 = screen.getByTestId('quantity-input-1');
    fireEvent.change(quantityInput1, { target: { value: '2' } });
    
    // Total should be (3 * 1.00) + (2 * 0.50) = 3.00 + 1.00 = 4.00
    await waitFor(() => expect(screen.getByTestId('total-sale-amount')).toHaveTextContent('Total: ₹4.00'));
  });

  test('prevents quantity exceeding available stock', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());

    fireEvent.mouseDown(screen.getByTestId('item-select-0').querySelector('button')!);
    fireEvent.click(await screen.findByText(/Banana \(Stock: 5\)/i)); // Banana has stock 5

    const quantityInput = screen.getByTestId('quantity-input-0') as HTMLInputElement;
    fireEvent.change(quantityInput, { target: { value: '10' } }); // Try to set quantity to 10
    expect(quantityInput.value).toBe('5'); // Should be capped at 5
  });
  
  test('shows validation error if submitting with no item selected', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());
    
    const submitButton = screen.getByTestId('record-sale-submit-button');
    fireEvent.click(submitButton);

    expect(await screen.findByText('Please select an item.')).toBeInTheDocument();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  test('successfully records a sale', async () => {
    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());

    // Select Apple, Qty 2
    fireEvent.mouseDown(screen.getByTestId('item-select-0').querySelector('button')!);
    fireEvent.click(await screen.findByText(/Apple \(Stock: 10\)/i));
    fireEvent.change(screen.getByTestId('quantity-input-0'), { target: { value: '2' } });

    // Add another item, Select Banana, Qty 1
    fireEvent.click(screen.getByTestId('add-another-item-button'));
    const itemSelect1 = screen.getByTestId('item-select-1');
    fireEvent.mouseDown(itemSelect1.querySelector('button')!);
    fireEvent.click(await screen.findByText(/Banana \(Stock: 5\)/i));
    fireEvent.change(screen.getByTestId('quantity-input-1'), { target: { value: '1' } });

    const submitButton = screen.getByTestId('record-sale-submit-button');
    await act(async () => {
      fireEvent.click(submitButton);
    });
    
    expect(screen.getByTestId('submit-loader')).toBeInTheDocument();

    await waitFor(() => expect(mockRunTransaction).toHaveBeenCalledTimes(1));
    
    // Verify transaction logic (simplified check, actual updates are complex)
    const transactionCallback = mockRunTransaction.mock.calls[0][1];
    const mockTransaction = { get: mockGetDoc, update: jest.fn(), set: jest.fn() };
    
    // This part is tricky because the actual data might be updated in the mockAvailableItems
    // For a robust test, you'd check the `transaction.update` calls with correct IDs and quantities.
    // For now, we check that logs are called correctly post-transaction.
    
    await waitFor(() => {
      expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({
        stockItemId: 'item1', // Apple
        type: 'SALE_FROM_STALL',
        quantityChange: -2,
      }));
      expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({
        stockItemId: 'master-apple', // Master Apple
        type: 'SALE_AFFECTS_MASTER',
        quantityChange: -2,
      }));
       expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({
        stockItemId: 'item2', // Banana
        type: 'SALE_FROM_STALL',
        quantityChange: -1,
      }));
      expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({
        stockItemId: 'master-banana', // Master Banana
        type: 'SALE_AFFECTS_MASTER',
        quantityChange: -1,
      }));
    });

    expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Sale Recorded Successfully!" }));
    // Form should reset - check if the first item select is back to placeholder
    await waitFor(() => {
      const firstItemSelect = screen.getByTestId('item-select-0');
      expect(within(firstItemSelect).getByText('Select an item')).toBeInTheDocument();
    });
  });

  test('handles transaction error (e.g., insufficient stock during transaction)', async () => {
    mockRunTransaction.mockImplementationOnce(async (db, updateFunction) => {
      const transaction = {
        get: jest.fn(async (docRef) => {
            if (docRef.id === 'item1') return { exists: () => true, data: () => ({...mockAvailableItems[0], quantity: 1}) }; // Simulate stock changed to 1
            return { exists: () => false, data: () => null };
        }),
        update: jest.fn(),
        set: jest.fn(),
      };
      // Simulate the error being thrown from within the transaction logic
      try {
        await updateFunction(transaction);
      } catch (e) {
        throw new Error("Not enough stock for Apple. Available: 1, Requested: 2.");
      }
    });

    render(<RecordSaleForm />);
    await waitFor(() => expect(screen.queryByTestId('loading-items-indicator')).not.toBeInTheDocument());
    
    fireEvent.mouseDown(screen.getByTestId('item-select-0').querySelector('button')!);
    fireEvent.click(await screen.findByText(/Apple \(Stock: 10\)/i));
    fireEvent.change(screen.getByTestId('quantity-input-0'), { target: { value: '2' } }); // Request 2

    const submitButton = screen.getByTestId('record-sale-submit-button');
    await act(async () => {
        fireEvent.click(submitButton);
    });
    
    await waitFor(() => expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({
      title: "Sale Recording Failed",
      description: "Error: Not enough stock for Apple. Available: 1, Requested: 2. Please refresh available items or adjust quantity.",
      variant: "destructive"
    })));
    expect(logStockMovement).not.toHaveBeenCalled(); // Logs shouldn't happen on failure
  });
});

