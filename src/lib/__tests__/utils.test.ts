
import { cn } from '../utils';

describe('cn utility function', () => {
  it('should merge multiple class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('should handle conditional classes correctly', () => {
    expect(cn('base', { conditional: true, ignore: false })).toBe('base conditional');
    expect(cn({ conditional: true, also: true }, 'base')).toBe('conditional also base');
  });

  it('should handle null, undefined, and empty string inputs gracefully', () => {
    expect(cn('class1', null, 'class2', undefined, '', 'class3')).toBe('class1 class2 class3');
  });

  it('should handle an array of class names', () => {
    expect(cn(['class1', 'class2'], 'class3')).toBe('class1 class2 class3');
  });

  it('should handle mixed types of arguments', () => {
    expect(cn('foo', null, 'bar', undefined, { baz: true, qux: false }, ['quux', 'corge'])).toBe('foo bar baz quux corge');
  });
  
  it('should override conflicting Tailwind classes correctly via twMerge', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('bg-red-500', 'text-xl', 'bg-blue-500')).toBe('text-xl bg-blue-500');
    expect(cn('m-1 m-2 m-3')).toBe('m-3');
  });

  it('should return an empty string for no valid inputs', () => {
    expect(cn(null, undefined, false, '')).toBe('');
  });
});
