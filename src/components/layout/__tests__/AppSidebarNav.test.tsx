
import { render, screen, within } from '@testing-library/react';
import { AppSidebarNav } from '@/components/layout/AppSidebarNav';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/types';

// Mock dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

// Mock the Sidebar UI components to focus on AppSidebarNav logic
// We only care that AppSidebarNav passes the correct props to SidebarMenuButton
jest.mock('@/components/ui/sidebar', () => {
  const R = require('react');
  const originalModule = jest.requireActual('@/components/ui/sidebar');
  return {
    ...originalModule,
    SidebarMenu: ({ children }) => <ul data-testid="sidebar-menu">{children}</ul>,
    SidebarMenuItem: ({ children }) => <li data-testid="sidebar-menu-item">{children}</li>,
    SidebarMenuButton: R.forwardRef(({ children, isActive, tooltip, ...props }, ref) => (
      <button
        ref={ref}
        data-testid="sidebar-menu-button"
        data-active={isActive ? 'true' : 'false'}
        data-tooltip-label={typeof tooltip === 'object' ? tooltip.children : tooltip}
        {...props}
      >
        {children}
      </button>
    )),
  };
});


const mockNavItemsConfig = [ // Simplified config for testing
  { href: "/dashboard", label: "Dashboard", roles: ['staff', 'manager', 'admin'], exactMatch: true, iconName: 'LayoutDashboard' },
  { href: "/items", label: "Stock Items", roles: ['staff', 'manager', 'admin'], iconName: 'Package' },
  { href: "/sales/record", label: "Record Sale", roles: ['staff', 'manager', 'admin'], iconName: 'ShoppingCart' },
  { href: "/sales/history", label: "Sales History", roles: ['staff', 'manager', 'admin'], iconName: 'History' },
  { href: "/reports", label: "Reports", roles: ['manager', 'admin'], iconName: 'BarChart3' },
  { href: "/users", label: "User Management", roles: ['admin'], iconName: 'Users' },
  { href: "/admin/sites", label: "Manage Sites & Stalls", roles: ['admin'], iconName: 'Building' },
  { href: "/admin/activity-log", label: "Activity Log", roles: ['admin'], iconName: 'FileText' },
  { href: "/profile", label: "My Profile", roles: ['staff', 'manager', 'admin'], iconName: 'UserCircle' },
  { href: "/settings", label: "Settings", roles: ['manager', 'admin'], iconName: 'Settings' },
  { href: "/support", label: "Support", roles: ['staff', 'manager', 'admin'], iconName: 'LifeBuoy' },
];


describe('AppSidebarNav Component', () => {
  let mockUseAuth: jest.Mock;
  let mockUsePathname: jest.Mock;

  beforeEach(() => {
    mockUseAuth = useAuth as jest.Mock;
    mockUsePathname = usePathname as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const assertNavItems = (expectedLabels: string[]) => {
    const renderedButtons = screen.getAllByTestId('sidebar-menu-button');
    const renderedLabels = renderedButtons.map(button => button.textContent?.replace(/Icon$/, '')); // Remove "Icon" suffix from mock
    
    // Debugging:
    // console.log("Expected Labels:", expectedLabels);
    // console.log("Rendered Labels:", renderedLabels);

    expect(renderedLabels.length).toBe(expectedLabels.length);
    expectedLabels.forEach(label => {
      expect(renderedLabels).toContain(expect.stringContaining(label));
    });
  };

  test('renders correct items for staff user', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'staff' } });
    mockUsePathname.mockReturnValue('/dashboard');
    render(<AppSidebarNav />);
    const expectedStaffLabels = mockNavItemsConfig
      .filter(item => item.roles.includes('staff'))
      .map(item => item.label);
    assertNavItems(expectedStaffLabels);
  });

  test('renders correct items for manager user', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'manager' } });
    mockUsePathname.mockReturnValue('/dashboard');
    render(<AppSidebarNav />);
    const expectedManagerLabels = mockNavItemsConfig
      .filter(item => item.roles.includes('manager'))
      .map(item => item.label);
    assertNavItems(expectedManagerLabels);
  });

  test('renders correct items for admin user', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    mockUsePathname.mockReturnValue('/dashboard');
    render(<AppSidebarNav />);
    const expectedAdminLabels = mockNavItemsConfig
      .filter(item => item.roles.includes('admin'))
      .map(item => item.label);
    assertNavItems(expectedAdminLabels);
  });

  test('highlights active link correctly for exact match (Dashboard)', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    mockUsePathname.mockReturnValue('/dashboard');
    render(<AppSidebarNav />);
    const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
    expect(dashboardButton).toHaveAttribute('data-active', 'true');

    const itemsButton = screen.getByRole('button', { name: /stock items/i });
    expect(itemsButton).toHaveAttribute('data-active', 'false');
  });

  test('highlights active link correctly for partial match (Stock Items)', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    mockUsePathname.mockReturnValue('/items/new');
    render(<AppSidebarNav />);
    
    const itemsButton = screen.getByRole('button', { name: /stock items/i });
    expect(itemsButton).toHaveAttribute('data-active', 'true');

    const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
    expect(dashboardButton).toHaveAttribute('data-active', 'false');
  });

  test('passes correct label to tooltip prop', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    mockUsePathname.mockReturnValue('/dashboard');
    render(<AppSidebarNav />);

    const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
    expect(dashboardButton).toHaveAttribute('data-tooltip-label', 'Dashboard');

    const itemsButton = screen.getByRole('button', { name: /stock items/i });
    expect(itemsButton).toHaveAttribute('data-tooltip-label', 'Stock Items');
  });

  test('renders correct icons (mocked)', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    mockUsePathname.mockReturnValue('/dashboard');
    render(<AppSidebarNav />);

    // Example check for Dashboard icon
    const dashboardButton = screen.getByRole('button', { name: /dashboard/i });
    // The mocked icon renders a span with text content like 'LayoutDashboardIcon'
    expect(within(dashboardButton).getByText('LayoutDashboard')).toBeInTheDocument();
    expect(within(dashboardButton).getByTestId('lucide-LayoutDashboard')).toBeInTheDocument();

    // Example check for Stock Items icon
    const itemsButton = screen.getByRole('button', { name: /stock items/i });
    expect(within(itemsButton).getByText('Package')).toBeInTheDocument();
    expect(within(itemsButton).getByTestId('lucide-Package')).toBeInTheDocument();
  });
});
