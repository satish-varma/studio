
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ItemTable } from '@/components/items/ItemTable'; // Adjust path as necessary
import type { StockItem, Stall } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { logStockMovement } from '@/lib/stockLogger';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('@/hooks/use-toast');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/lib/stockLogger');

const mockRunTransaction = jest.fn();
const mockWriteBatchCommit = jest.fn();
const mockWriteBatchUpdate = jest.fn();
const mockWriteBatchSet = jest.fn();
const mockWriteBatchDelete = jest.fn();

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockDeleteDoc = jest.fn(); // For single delete if not using transaction

jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'),
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn((db, collectionName, id) => ({ path: `${collectionName}/${id}`, id })),
  collection: jest.fn((db, collectionName) => ({ path: collectionName })),
  query: jest.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })),
  where: jest.fn((fieldPath, opStr, value) => ({ fieldPath, opStr, value, type: 'where' })),
  orderBy: jest.fn((fieldPath, directionStr) => ({ fieldPath, directionStr, type: 'orderBy' })),
  limit: jest.fn(count => ({ count, type: 'limit' })),
  startAfter: jest.fn(doc => ({ doc, type: 'startAfter' })),
  getDoc: jest.fn((docRef) => mockGetDoc(docRef)),
  getDocs: jest.fn((queryRef) => mockGetDocs(queryRef)),
  deleteDoc: jest.fn((docRef) => mockDeleteDoc(docRef)),
  updateDoc: jest.fn(),
  runTransaction: jest.fn((db, callback) => mockRunTransaction(db, callback)),
  writeBatch: jest.fn(() => ({
    commit: mockWriteBatchCommit,
    update: mockWriteBatchUpdate,
    set: mockWriteBatchSet,
    delete: mockWriteBatchDelete,
  })),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date() })),
    fromDate: jest.fn((date) => ({ toDate: () => date })),
  },
}));

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));

const mockUser = {
  uid: 'test-admin-uid',
  email: 'admin@example.com',
  displayName: 'Test Admin',
  role: 'admin',
};

const mockSitesMap = { 'site-1': 'Main Site', 'site-2': 'Warehouse Site' };
const mockStallsMap = { 'stall-A': 'Front Counter', 'stall-B': 'Storage Area', 'stall-C': 'Retail Kiosk' };

const mockMasterItem1: StockItem = {
  id: 'master-item-1', name: 'Master Product Alpha', category: 'Electronics',
  quantity: 100, unit: 'pcs', price: 199.99, costPrice: 100, lowStockThreshold: 10,
  siteId: 'site-1', stallId: null, originalMasterItemId: null, lastUpdated: new Date().toISOString(),
};
const mockStallItem1A: StockItem = {
  id: 'stall-item-1A', name: 'Master Product Alpha (Stall)', category: 'Electronics',
  quantity: 20, unit: 'pcs', price: 199.99, costPrice: 100, lowStockThreshold: 5,
  siteId: 'site-1', stallId: 'stall-A', originalMasterItemId: 'master-item-1', lastUpdated: new Date().toISOString(),
};
const mockStallItem1B_Unlinked: StockItem = {
  id: 'stall-item-1B-unlinked', name: 'Standalone Product Beta', category: 'Books',
  quantity: 15, unit: 'pcs', price: 29.99, costPrice: 15, lowStockThreshold: 3,
  siteId: 'site-1', stallId: 'stall-B', originalMasterItemId: null, lastUpdated: new Date().toISOString(),
};

const mockItems: StockItem[] = [mockMasterItem1, mockStallItem1A, mockStallItem1B_Unlinked];
const mockAvailableStalls: Stall[] = [
  { id: 'stall-A', name: 'Front Counter', siteId: 'site-1', stallType: 'Retail Counter', createdAt: '', updatedAt: '' },
  { id: 'stall-B', name: 'Storage Area', siteId: 'site-1', stallType: 'Storage Room', createdAt: '', updatedAt: '' },
  { id: 'stall-C', name: 'Retail Kiosk', siteId: 'site-1', stallType: 'Pop-up Booth', createdAt: '', updatedAt: '' },
];

describe('ItemTable Component - Actions and Dialogs', () => {
  let mockPush: jest.Mock;
  let mockToastFn: jest.Mock;
  let mockOnDataNeedsRefresh: jest.Mock;

  beforeEach(() => {
    mockPush = jest.fn();
    mockToastFn = jest.fn();
    mockOnDataNeedsRefresh = jest.fn();

    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToastFn });
    (logStockMovement as jest.Mock).mockResolvedValue(undefined);

    mockRunTransaction.mockImplementation(async (db, callback) => {
      const transaction = {
        get: mockGetDoc,
        update: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
      };
      return callback(transaction);
    });
    mockWriteBatchCommit.mockResolvedValue(undefined);
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] }); // Default for queries
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper to open dropdown for an item
  const openItemDropdown = async (itemId: string) => {
    const actionsButton = screen.getByTestId(`actions-button-${itemId}`);
    fireEvent.click(actionsButton);
  };

  describe('Update Stock Dialog', () => {
    test('opens, updates quantity, calls transaction, and logs', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...mockMasterItem1, quantity: 100 }), // Initial quantity
        id: mockMasterItem1.id,
      });

      render(<ItemTable items={mockItems} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{ key: null, direction: null }} requestSort={jest.fn()} />);
      
      await openItemDropdown(mockMasterItem1.id);
      fireEvent.click(await screen.findByText('Update Stock'));

      expect(await screen.findByText(`Update Stock for ${mockMasterItem1.name}`)).toBeInTheDocument();
      
      const quantityInput = screen.getByTestId('update-stock-quantity-input');
      fireEvent.change(quantityInput, { target: { value: '150' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('update-stock-confirm-button'));
      });
      
      await waitFor(() => expect(mockRunTransaction).toHaveBeenCalled());
      // Inside mockRunTransaction, transaction.update would be called.
      // We can check if logStockMovement was called with correct params.
      await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          stockItemId: mockMasterItem1.id,
          type: 'DIRECT_MASTER_UPDATE',
          quantityChange: 50,
          quantityBefore: 100,
          quantityAfter: 150,
        })
      ));
      expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Stock Updated" }));
      expect(mockOnDataNeedsRefresh).toHaveBeenCalled();
    });
  });

  describe('Allocate to Stall Dialog', () => {
    test('allocates master stock to a new stall item', async () => {
      mockGetDoc.mockImplementation((docRef: any) => {
        if (docRef.id === mockMasterItem1.id) {
          return Promise.resolve({ exists: () => true, data: () => mockMasterItem1, id: mockMasterItem1.id });
        }
        return Promise.resolve({ exists: () => false }); // Simulate no existing stall item
      });
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] }); // No existing stall item by query

      render(<ItemTable items={mockItems} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{ key: null, direction: null }} requestSort={jest.fn()} />);
      
      await openItemDropdown(mockMasterItem1.id);
      fireEvent.click(screen.getByTestId(`allocate-action-${mockMasterItem1.id}`));

      expect(await screen.findByText(`Allocate Stock: ${mockMasterItem1.name}`)).toBeInTheDocument();
      
      fireEvent.mouseDown(screen.getByTestId('allocate-stall-select-trigger'));
      fireEvent.click(await screen.findByText(mockAvailableStalls[0].name)); // Select first stall

      const quantityInput = screen.getByTestId('allocate-quantity-input');
      fireEvent.change(quantityInput, { target: { value: '10' } });
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('allocate-confirm-button'));
      });

      await waitFor(() => expect(mockRunTransaction).toHaveBeenCalled());
      // Expect master stock allocation log
      await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          stockItemId: mockMasterItem1.id,
          type: 'ALLOCATE_TO_STALL',
          quantityChange: -10,
          notes: expect.stringContaining(`Allocated 10 unit(s) of ${mockMasterItem1.name} to stall: ${mockAvailableStalls[0].name}`),
        })
      ));
      // Expect stall item receiving log
      await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          // stockItemId will be the new stall item's ID (which is auto-generated)
          type: 'RECEIVE_ALLOCATION',
          quantityChange: 10,
          notes: expect.stringContaining(`Received 10 unit(s) of ${mockMasterItem1.name} from master stock`),
        })
      ));
      expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Stock Allocated" }));
    });
  });
  
  describe('Return to Master Dialog', () => {
    test('returns stall item stock to master', async () => {
      mockGetDoc.mockImplementation((docRef: any) => {
        if (docRef.id === mockStallItem1A.id) {
          return Promise.resolve({ exists: () => true, data: () => mockStallItem1A, id: mockStallItem1A.id });
        }
        if (docRef.id === mockStallItem1A.originalMasterItemId) { // master-item-1
          return Promise.resolve({ exists: () => true, data: () => mockMasterItem1, id: mockMasterItem1.id });
        }
        return Promise.resolve({ exists: () => false });
      });

      render(<ItemTable items={mockItems} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{ key: null, direction: null }} requestSort={jest.fn()} />);
      
      await openItemDropdown(mockStallItem1A.id);
      fireEvent.click(screen.getByTestId(`return-action-${mockStallItem1A.id}`));

      expect(await screen.findByText(`Return to Master Stock: ${mockStallItem1A.name}`)).toBeInTheDocument();
      
      const quantityInput = screen.getByTestId('return-quantity-input');
      fireEvent.change(quantityInput, { target: { value: '5' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('return-confirm-button'));
      });
      
      await waitFor(() => expect(mockRunTransaction).toHaveBeenCalled());
      // Log for stall item reduction
      await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          stockItemId: mockStallItem1A.id,
          type: 'RETURN_TO_MASTER',
          quantityChange: -5,
        })
      ));
      // Log for master item increase
      await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          stockItemId: mockMasterItem1.id,
          type: 'RECEIVE_RETURN_FROM_STALL',
          quantityChange: 5,
        })
      ));
      expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Stock Returned to Master" }));
    });
  });

  describe('Transfer to Stall Dialog', () => {
    test('transfers stock from one stall item to another (or new)', async () => {
        mockGetDoc.mockImplementation((docRef: any) => {
            if (docRef.id === mockStallItem1A.id) { // Source stall item
                return Promise.resolve({ exists: () => true, data: () => mockStallItem1A, id: mockStallItem1A.id });
            }
            // For destination, assume it doesn't exist to test creation path
            return Promise.resolve({ exists: () => false });
        });
        // Query for existing destination item:
        mockGetDocs.mockResolvedValue({ empty: true, docs: [] }); 


        render(<ItemTable items={mockItems} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{key:null, direction: null}} requestSort={jest.fn()} />);
        
        await openItemDropdown(mockStallItem1A.id);
        fireEvent.click(screen.getByTestId(`transfer-action-${mockStallItem1A.id}`));

        expect(await screen.findByText(`Transfer Stock: ${mockStallItem1A.name}`)).toBeInTheDocument();

        // Select destination stall (stall-B, different from stall-A)
        fireEvent.mouseDown(screen.getByTestId('transfer-stall-select-trigger'));
        fireEvent.click(await screen.findByText(mockAvailableStalls.find(s=>s.id==='stall-B')!.name)); 

        const quantityInput = screen.getByTestId('transfer-quantity-input');
        fireEvent.change(quantityInput, { target: { value: '3' }});

        await act(async () => {
            fireEvent.click(screen.getByTestId('transfer-confirm-button'));
        });

        await waitFor(() => expect(mockRunTransaction).toHaveBeenCalled());
        // Log for source item reduction
        await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
            mockUser,
            expect.objectContaining({
                stockItemId: mockStallItem1A.id,
                type: 'TRANSFER_OUT_FROM_STALL',
                quantityChange: -3,
            })
        ));
        // Log for destination item increase (new item in this case)
        await waitFor(() => expect(logStockMovement).toHaveBeenCalledWith(
            mockUser,
            expect.objectContaining({
                // stockItemId: new item ID
                stallId: 'stall-B',
                type: 'TRANSFER_IN_TO_STALL',
                quantityChange: 3,
            })
        ));
        expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Transfer Successful"}));
    });
  });

  describe('Batch Actions for Stall Items', () => {
    beforeEach(() => {
        // Ensure some stall items are selected
        mockStallItem1A.stallId = 'stall-A'; // Make sure it's a stall item
        mockStallItem1B_Unlinked.stallId = 'stall-B';
    });

    test('Batch Delete: deletes selected stall items and adjusts master stock', async () => {
        mockGetDoc.mockImplementation((docRef: any) => {
            if (docRef.id === mockStallItem1A.id) return Promise.resolve({ exists: () => true, data: () => mockStallItem1A, id: mockStallItem1A.id});
            if (docRef.id === mockStallItem1A.originalMasterItemId) return Promise.resolve({ exists: () => true, data: () => mockMasterItem1, id: mockMasterItem1.id});
            if (docRef.id === mockStallItem1B_Unlinked.id) return Promise.resolve({ exists: () => true, data: () => mockStallItem1B_Unlinked, id: mockStallItem1B_Unlinked.id});
            return Promise.resolve({exists: () => false});
        });

        render(<ItemTable items={mockItems} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{key:null, direction: null}} requestSort={jest.fn()} />);
        
        fireEvent.click(screen.getByTestId(`checkbox-${mockStallItem1A.id}`));
        fireEvent.click(screen.getByTestId(`checkbox-${mockStallItem1B_Unlinked.id}`));
        
        fireEvent.click(screen.getByRole('button', { name: /batch actions/i }));
        fireEvent.click(screen.getByTestId('batch-delete-action'));
        
        expect(await screen.findByText('Confirm Batch Delete')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByTestId('batch-delete-confirm-button'));
        });

        await waitFor(() => expect(mockRunTransaction).toHaveBeenCalledTimes(2)); // Once for each item
        expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Batch Delete Processed" }));
        expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({type: 'BATCH_STALL_DELETE', stockItemId: mockStallItem1A.id}));
        expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({type: 'RECEIVE_RETURN_FROM_STALL', stockItemId: mockMasterItem1.id, quantityChange: mockStallItem1A.quantity}));
        expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({type: 'BATCH_STALL_DELETE', stockItemId: mockStallItem1B_Unlinked.id}));
    });

    test('Batch Update Stock: sets quantity for selected stall items', async () => {
        mockGetDoc.mockImplementation((docRef: any) => {
             if (docRef.id === mockStallItem1A.id) return Promise.resolve({ exists: () => true, data: () => mockStallItem1A, id: mockStallItem1A.id});
             if (docRef.id === mockStallItem1A.originalMasterItemId) return Promise.resolve({ exists: () => true, data: () => ({...mockMasterItem1, quantity: 100}), id: mockMasterItem1.id}); // Give master some quantity
            return Promise.resolve({exists: () => false});
        });
        render(<ItemTable items={[mockStallItem1A]} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{key:null, direction: null}} requestSort={jest.fn()} />);
        
        fireEvent.click(screen.getByTestId(`checkbox-${mockStallItem1A.id}`));
        fireEvent.click(screen.getByRole('button', { name: /batch actions/i }));
        fireEvent.click(screen.getByTestId('batch-set-stock-action'));

        const quantityInput = await screen.findByTestId('batch-update-stock-quantity-input');
        fireEvent.change(quantityInput, {target: { value: '50' }});
        
        await act(async () => {
          fireEvent.click(screen.getByTestId('batch-update-stock-confirm-button'));
        });

        await waitFor(() => expect(mockRunTransaction).toHaveBeenCalled());
        expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Batch Stock Update Processed" }));
        expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({type: 'BATCH_STALL_UPDATE_SET', stockItemId: mockStallItem1A.id, quantityAfter: 50}));
        expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({type: 'DIRECT_STALL_UPDATE_AFFECTS_MASTER', stockItemId: mockMasterItem1.id}));
    });
  });

  describe('Single Item Delete Action', () => {
    test('opens confirmation dialog and deletes item on confirm', async () => {
        mockGetDoc.mockResolvedValue({
            exists: () => true,
            data: () => mockStallItem1B_Unlinked, // Unlinked stall item for simpler delete test
            id: mockStallItem1B_Unlinked.id,
        });
        mockDeleteDoc.mockResolvedValue(undefined); // Mock for single delete if transaction isn't used for simple case

        render(<ItemTable items={[mockStallItem1B_Unlinked]} sitesMap={mockSitesMap} stallsMap={mockStallsMap} availableStallsForAllocation={mockAvailableStalls} onDataNeedsRefresh={mockOnDataNeedsRefresh} loading={false} sortConfig={{ key: null, direction: null }} requestSort={jest.fn()} />);
        
        await openItemDropdown(mockStallItem1B_Unlinked.id);
        fireEvent.click(screen.getByTestId(`delete-action-${mockStallItem1B_Unlinked.id}`));

        expect(await screen.findByText(`Are you sure?`)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(`permanently delete the item "${mockStallItem1B_Unlinked.name}"`))).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByTestId('single-delete-confirm-button'));
        });
        
        await waitFor(() => expect(mockRunTransaction).toHaveBeenCalled()); // handleDelete uses runTransaction
        expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Item Deleted" }));
        expect(logStockMovement).toHaveBeenCalledWith(mockUser, expect.objectContaining({ type: 'DELETE_STALL_ITEM', stockItemId: mockStallItem1B_Unlinked.id }));
        expect(mockOnDataNeedsRefresh).toHaveBeenCalled();
    });
  });


});

