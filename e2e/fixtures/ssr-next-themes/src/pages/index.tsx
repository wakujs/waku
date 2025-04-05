'use client';
import { useTheme } from 'next-themes';
export default function Page() {
  const { resolvedTheme: theme, setTheme } = useTheme();
  return (
    <div>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle theme
      </button>
    </div>
  );
}
