'use client';
import { useTheme } from 'next-themes';
export default function Page() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      {theme}
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle theme
      </button>
    </div>
  );
}
