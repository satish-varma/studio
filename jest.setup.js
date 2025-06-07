
// Optional: configure or set up a testing framework before each test
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock lucide-react icons
jest.mock('lucide-react', () => {
  const R = require('react'); // Use 'R' to avoid conflict with React type
  const LucideIcons = jest.requireActual('lucide-react'); // Get actual exports

  const mockedIcons = {};
  for (const iconName in LucideIcons) {
    if (Object.prototype.hasOwnProperty.call(LucideIcons, iconName) && typeof LucideIcons[iconName] === 'function') {
      // Create a mock component that renders a simple span with a data-testid or the icon name
      // This specific mock returns a span with the icon's supposed name as text content for easy assertion
      // and a data-testid for targeting.
      const MockIconComponent = (props) => {
        // Remove non-standard props like 'iconNode' if they are passed by some internal HOCs
        const { iconNode, ...restProps } = props;
        return R.createElement('span', { 'data-testid': `lucide-${iconName}`, ...restProps }, iconName);
      };
      MockIconComponent.displayName = iconName; // Set display name for better debugging
      mockedIcons[iconName] = MockIconComponent;
    }
  }
  return mockedIcons;
});
