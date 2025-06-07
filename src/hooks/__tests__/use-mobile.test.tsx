
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-mobile'; // Adjust path as necessary

const MOBILE_BREAKPOINT = 768; // Ensure this matches the constant in use-mobile.tsx

describe('useIsMobile Hook', () => {
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: typeof window.innerWidth;

  const mockMatchMedia = (matches: boolean) => {
    return jest.fn().mockImplementation(query => ({
      matches: matches,
      media: query,
      onchange: null,
      addListener: jest.fn(), // Deprecated but JSDOM might use it
      removeListener: jest.fn(), // Deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  };

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    // Restore original innerWidth or clear the mock
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    jest.restoreAllMocks();
  });

  test('should return true if initial window width is less than mobile breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: MOBILE_BREAKPOINT - 100, // e.g., 668
    });
    window.matchMedia = mockMatchMedia(true);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test('should return false if initial window width is greater than or equal to mobile breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: MOBILE_BREAKPOINT + 100, // e.g., 868
    });
    window.matchMedia = mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test('should update when window resizes across the breakpoint (to mobile)', () => {
    // Initial state: desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: MOBILE_BREAKPOINT + 100,
    });
    
    let mql: MediaQueryList;
    const addEventListenerMock = jest.fn((event, callback) => {
      if (event === 'change') {
        mql.onchange = callback; // Simulate storing the callback
      }
    });
    const removeEventListenerMock = jest.fn((event, callback) => {
       if (event === 'change' && mql.onchange === callback) {
        mql.onchange = null;
      }
    });

    window.matchMedia = jest.fn().mockImplementation(query => {
      mql = {
        matches: window.innerWidth < MOBILE_BREAKPOINT,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
        dispatchEvent: jest.fn(),
      } as unknown as MediaQueryList;
      return mql;
    });
    
    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false); // Initial state: desktop

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: MOBILE_BREAKPOINT - 50,
      });
      // Manually trigger the stored onchange handler
      if (mql && mql.onchange) {
        // Update matches before calling onchange
        (mql as any).matches = window.innerWidth < MOBILE_BREAKPOINT;
        (mql.onchange as EventListener)({} as Event);
      }
    });
    rerender(); // Rerender hook after state change simulation
    expect(result.current).toBe(true); // Should now be mobile
  });

  test('should update when window resizes across the breakpoint (to desktop)', () => {
    // Initial state: mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: MOBILE_BREAKPOINT - 50,
    });
    
    let mql: MediaQueryList;
    const addEventListenerMock = jest.fn((event, callback) => {
      if (event === 'change') {
        mql.onchange = callback;
      }
    });
    const removeEventListenerMock = jest.fn((event, callback) => {
       if (event === 'change' && mql.onchange === callback) {
        mql.onchange = null;
      }
    });

    window.matchMedia = jest.fn().mockImplementation(query => {
      mql = {
        matches: window.innerWidth < MOBILE_BREAKPOINT,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
        dispatchEvent: jest.fn(),
      } as unknown as MediaQueryList;
      return mql;
    });

    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true); // Initial state: mobile

    // Simulate resize to desktop
     act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: MOBILE_BREAKPOINT + 50,
      });
      if (mql && mql.onchange) {
        (mql as any).matches = window.innerWidth < MOBILE_BREAKPOINT;
        (mql.onchange as EventListener)({} as Event);
      }
    });
    rerender();
    expect(result.current).toBe(false); // Should now be desktop
  });

  test('should clean up event listener on unmount', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: MOBILE_BREAKPOINT - 100,
    });
    
    const removeEventListenerSpy = jest.fn();
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: window.innerWidth < MOBILE_BREAKPOINT,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: jest.fn(),
    }));

    const { unmount } = renderHook(() => useIsMobile());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

    