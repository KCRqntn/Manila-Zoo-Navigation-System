import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'fil';

// Pastel colour themes; the colours themselves live in index.css under html[data-palette]
export const PALETTES = [
  { id: 'mint', en: 'Mint', fil: 'Mint', swatch: 'hsl(150 55% 72%)' },
  { id: 'sky', en: 'Sky', fil: 'Langit', swatch: 'hsl(205 70% 75%)' },
  { id: 'lavender', en: 'Lavender', fil: 'Lavender', swatch: 'hsl(262 60% 80%)' },
  { id: 'peach', en: 'Peach', fil: 'Peach', swatch: 'hsl(18 85% 78%)' },
  { id: 'rose', en: 'Rose', fil: 'Rosas', swatch: 'hsl(340 70% 80%)' },
] as const;
export type Palette = typeof PALETTES[number]['id'];

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Storage can be unavailable (private mode, blocked site data); fall back to defaults
const readStored = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const writeStored = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* not saved */ }
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  // Remembered like the theme, so Filipino stays on after a refresh or opening a QR link
  const [language, setLanguage] = useState<Language>(() => (readStored('language') === 'fil' ? 'fil' : 'en'));
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (readStored('theme') as 'light' | 'dark') || 'light'
  );
  const [palette, setPalette] = useState<Palette>(() => {
    const stored = readStored('palette');
    return PALETTES.some(p => p.id === stored) ? stored as Palette : 'mint';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    writeStored('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === 'fil' ? 'fil' : 'en';
    writeStored('language', language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset['palette'] = palette;
    writeStored('palette', palette);
  }, [palette]);

  return (
    <AppContext.Provider value={{ language, setLanguage, theme, setTheme, palette, setPalette }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppCtx = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppCtx must be used within AppProvider");
  return context;
};
