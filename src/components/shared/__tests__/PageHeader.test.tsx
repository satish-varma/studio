
import { render, screen } from '@testing-library/react';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

describe('PageHeader Component', () => {
  test('renders the title correctly', () => {
    render(<PageHeader title="Test Title" />);
    const titleElement = screen.getByRole('heading', { name: /test title/i, level: 1 });
    expect(titleElement).toBeInTheDocument();
  });

  test('renders the description when provided as a string', () => {
    render(<PageHeader title="Test Title" description="Test description." />);
    const descriptionElement = screen.getByText(/test description./i);
    expect(descriptionElement).toBeInTheDocument();
  });

  test('renders the description when provided as a ReactNode', () => {
    const descriptionNode = <p>React Node Description</p>;
    render(<PageHeader title="Test Title" description={descriptionNode} />);
    const descriptionElement = screen.getByText(/react node description/i);
    expect(descriptionElement).toBeInTheDocument();
    expect(descriptionElement.tagName).toBe('P');
  });

  test('renders actions when provided', () => {
    const actionsNode = <Button>Click Me</Button>;
    render(<PageHeader title="Test Title" actions={actionsNode} />);
    const actionButton = screen.getByRole('button', { name: /click me/i });
    expect(actionButton).toBeInTheDocument();
  });

  test('does not render description if not provided', () => {
    render(<PageHeader title="Test Title" />);
    // Check for the absence of the description container or text.
    // Assuming description text would be within the component if present.
    const potentialDescription = screen.queryByText(/test description/i); // Use a placeholder not expected
    expect(potentialDescription).not.toBeInTheDocument();
  });

  test('does not render actions if not provided', () => {
    render(<PageHeader title="Test Title" />);
    const potentialButton = screen.queryByRole('button');
    expect(potentialButton).not.toBeInTheDocument();
  });
});
