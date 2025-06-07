
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportControls } from '@/components/reports/ReportControls'; // Adjust path as necessary
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

// Mock the Calendar component to control its onSelect prop directly
// and to avoid rendering its complex internal structure.
jest.mock('@/components/ui/calendar', () => {
  const R = require('react');
  return {
    Calendar: R.forwardRef(({ selected, onSelect, ...props }: any, ref: any) => (
      <div data-testid="mock-calendar" {...props}>
        <button data-testid="mock-calendar-select-button" onClick={() => onSelect ? onSelect({ from: new Date(2023, 0, 1), to: new Date(2023, 0, 7) }) : null}>
          Simulate Date Select
        </button>
        {selected && selected.from && <p>Selected From: {format(selected.from, "LLL dd, y")}</p>}
        {selected && selected.to && <p>Selected To: {format(selected.to, "LLL dd, y")}</p>}
      </div>
    )),
  };
});


describe('ReportControls Component', () => {
  let mockOnDateRangeChange: jest.Mock;

  beforeEach(() => {
    mockOnDateRangeChange = jest.fn();
  });

  test('renders the date range picker button with placeholder text when no date range is selected', () => {
    render(<ReportControls dateRange={undefined} onDateRangeChange={mockOnDateRangeChange} />);
    const datePickerButton = screen.getByRole('button', { name: /pick a date range/i });
    expect(datePickerButton).toBeInTheDocument();
  });

  test('renders the date range picker button with formatted dates when a date range is selected', () => {
    const fromDate = new Date(2023, 5, 10); // June 10, 2023
    const toDate = new Date(2023, 5, 20);   // June 20, 2023
    const dateRange: DateRange = { from: fromDate, to: toDate };
    
    render(<ReportControls dateRange={dateRange} onDateRangeChange={mockOnDateRangeChange} />);
    
    const expectedButtonText = `${format(fromDate, "LLL dd, y")} - ${format(toDate, "LLL dd, y")}`;
    const datePickerButton = screen.getByRole('button', { name: new RegExp(expectedButtonText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    expect(datePickerButton).toBeInTheDocument();
  });

  test('renders the date range picker button with only "from" date if "to" date is not present', () => {
    const fromDate = new Date(2023, 5, 10); // June 10, 2023
    const dateRange: DateRange = { from: fromDate, to: undefined };
    
    render(<ReportControls dateRange={dateRange} onDateRangeChange={mockOnDateRangeChange} />);
    
    const expectedButtonText = format(fromDate, "LLL dd, y");
    const datePickerButton = screen.getByRole('button', { name: new RegExp(expectedButtonText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    expect(datePickerButton).toBeInTheDocument();
  });

  test('opens popover with calendar on button click', async () => {
    render(<ReportControls dateRange={undefined} onDateRangeChange={mockOnDateRangeChange} />);
    const datePickerButton = screen.getByRole('button', { name: /pick a date range/i });
    
    fireEvent.click(datePickerButton);
    
    // The PopoverContent and Calendar are rendered within a Portal,
    // so we look for an element within the calendar.
    expect(await screen.findByTestId('mock-calendar')).toBeInTheDocument();
  });

  test('calls onDateRangeChange when a date is selected in the (mocked) calendar', async () => {
    render(<ReportControls dateRange={undefined} onDateRangeChange={mockOnDateRangeChange} />);
    const datePickerButton = screen.getByRole('button', { name: /pick a date range/i });
    
    fireEvent.click(datePickerButton); // Open popover
    
    const mockCalendarSelectButton = await screen.findByTestId('mock-calendar-select-button');
    fireEvent.click(mockCalendarSelectButton); // Simulate date selection in the mocked calendar
    
    await waitFor(() => {
      expect(mockOnDateRangeChange).toHaveBeenCalledTimes(1);
      expect(mockOnDateRangeChange).toHaveBeenCalledWith({
        from: new Date(2023, 0, 1),
        to: new Date(2023, 0, 7),
      });
    });
  });
});
