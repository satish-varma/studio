
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SalesHistoryControls } from '@/components/sales/SalesHistoryControls';
import { format, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type { AppUser } from '@/types';

// Mock the Calendar component
jest.mock('@/components/ui/calendar', () => {
  const R = require('react');
  return {
    Calendar: R.forwardRef(({ selected, onSelect, ...props }: any, ref: any) => (
      <div data-testid={props['data-testid'] || "mock-calendar"} {...props}>
        <button 
          data-testid="mock-calendar-select-button" 
          onClick={() => onSelect ? onSelect({ from: new Date(2023, 0, 1), to: new Date(2023, 0, 7) }) : null}
        >
          Simulate Date Select
        </button>
        {selected && selected.from && <p>Selected From: {format(selected.from, "LLL dd, y")}</p>}
        {selected && selected.to && <p>Selected To: {format(selected.to, "LLL dd, y")}</p>}
      </div>
    )),
  };
});

const mockStaffMembers: AppUser[] = [
  { uid: 'staff1', displayName: 'John Doe', email: 'john@example.com', role: 'staff' },
  { uid: 'staff2', displayName: 'Jane Smith', email: 'jane@example.com', role: 'manager' },
];

describe('SalesHistoryControls Component', () => {
  let mockOnDateRangeChange: jest.Mock;
  let mockOnStaffFilterChange: jest.Mock;

  beforeEach(() => {
    mockOnDateRangeChange = jest.fn();
    mockOnStaffFilterChange = jest.fn();
  });

  // --- Date Range Picker Tests ---
  test('renders date range picker button with placeholder text', () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={[]}
        isLoadingStaff={false}
        showStaffFilter={false}
      />
    );
    expect(screen.getByTestId('date-range-picker-button')).toHaveTextContent('Pick a date range');
  });

  test('renders date range picker button with formatted dates', () => {
    const fromDate = new Date(2023, 5, 10);
    const toDate = new Date(2023, 5, 20);
    const dateRange: DateRange = { from: fromDate, to: toDate };
    render(
      <SalesHistoryControls
        dateRange={dateRange}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={[]}
        isLoadingStaff={false}
        showStaffFilter={false}
      />
    );
    const expectedButtonText = `${format(fromDate, "LLL dd, y")} - ${format(toDate, "LLL dd, y")}`;
    expect(screen.getByTestId('date-range-picker-button')).toHaveTextContent(expectedButtonText);
  });

  test('opens popover with calendar on button click', async () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={[]}
        isLoadingStaff={false}
        showStaffFilter={false}
      />
    );
    fireEvent.click(screen.getByTestId('date-range-picker-button'));
    expect(await screen.findByTestId('sales-history-calendar')).toBeInTheDocument();
  });

  test('calls onDateRangeChange when a date is selected in the (mocked) calendar', async () => {
     render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={[]}
        isLoadingStaff={false}
        showStaffFilter={false}
      />
    );
    fireEvent.click(screen.getByTestId('date-range-picker-button')); // Open popover
    const mockCalendarSelectButton = await screen.findByTestId('mock-calendar-select-button');
    fireEvent.click(mockCalendarSelectButton);
    
    await waitFor(() => {
      expect(mockOnDateRangeChange).toHaveBeenCalledWith({
        from: new Date(2023, 0, 1),
        to: new Date(2023, 0, 7),
      });
    });
  });

  // --- Staff Filter Tests ---
  test('does not render staff filter if showStaffFilter is false', () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={false}
        showStaffFilter={false}
      />
    );
    expect(screen.queryByTestId('staff-filter-select-trigger')).not.toBeInTheDocument();
  });

  test('renders staff filter if showStaffFilter is true', () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={false}
        showStaffFilter={true}
      />
    );
    expect(screen.getByTestId('staff-filter-select-trigger')).toBeInTheDocument();
  });

  test('staff filter shows "Loading staff..." and is disabled when isLoadingStaff is true', () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={true}
        showStaffFilter={true}
      />
    );
    const trigger = screen.getByTestId('staff-filter-select-trigger');
    expect(trigger).toHaveTextContent('Loading staff...');
    expect(trigger.querySelector('button') || trigger).toBeDisabled(); 
  });

  test('populates staff filter with "All Staff" and staff members', async () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={false}
        showStaffFilter={true}
      />
    );
    const trigger = screen.getByTestId('staff-filter-select-trigger');
    fireEvent.mouseDown(trigger.querySelector('button') || trigger); // Open select

    const content = await screen.findByTestId('staff-filter-select-content');
    expect(within(content).getByText('All Staff')).toBeInTheDocument();
    expect(within(content).getByText(`${mockStaffMembers[0].displayName} (${mockStaffMembers[0].role})`)).toBeInTheDocument();
    expect(within(content).getByText(`${mockStaffMembers[1].displayName} (${mockStaffMembers[1].role})`)).toBeInTheDocument();
  });

  test('staff filter reflects current staffFilter prop value', () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="staff1" // Specific staff selected
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={false}
        showStaffFilter={true}
      />
    );
    const trigger = screen.getByTestId('staff-filter-select-trigger');
    // The SelectValue should display the name of the selected staff member
    // This requires the component to map the ID back to display name or the Select component to handle it.
    // For this test, we'll assume the Select component handles displaying the correct item based on value.
    // We can check if the trigger has some text reflecting a selection.
    expect(trigger).toHaveTextContent(`${mockStaffMembers[0].displayName} (${mockStaffMembers[0].role})`);
  });

  test('calls onStaffFilterChange when a staff member is selected', async () => {
    render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="all"
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={false}
        showStaffFilter={true}
      />
    );
    const trigger = screen.getByTestId('staff-filter-select-trigger');
    fireEvent.mouseDown(trigger.querySelector('button') || trigger);

    const content = await screen.findByTestId('staff-filter-select-content');
    fireEvent.click(within(content).getByText(`${mockStaffMembers[1].displayName} (${mockStaffMembers[1].role})`));
    
    await waitFor(() => {
      expect(mockOnStaffFilterChange).toHaveBeenCalledWith('staff2');
    });
  });

  test('calls onStaffFilterChange with "all" when "All Staff" is selected', async () => {
     render(
      <SalesHistoryControls
        dateRange={undefined}
        onDateRangeChange={mockOnDateRangeChange}
        staffFilter="staff1" // Initially a specific staff
        onStaffFilterChange={mockOnStaffFilterChange}
        staffMembers={mockStaffMembers}
        isLoadingStaff={false}
        showStaffFilter={true}
      />
    );
    const trigger = screen.getByTestId('staff-filter-select-trigger');
    fireEvent.mouseDown(trigger.querySelector('button') || trigger);

    const content = await screen.findByTestId('staff-filter-select-content');
    fireEvent.click(within(content).getByText('All Staff'));
    
    await waitFor(() => {
      expect(mockOnStaffFilterChange).toHaveBeenCalledWith('all');
    });
  });
});
