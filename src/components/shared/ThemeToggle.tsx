import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      const isDark =
        localStorage.getItem("darkMode") === "true" ||
        document.documentElement.classList.contains("dark");
      setDarkMode(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    };

    checkDark();
    window.addEventListener("storage", checkDark);
    return () => window.removeEventListener("storage", checkDark);
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem("darkMode", newDarkMode.toString());
    document.documentElement.classList.toggle("dark", newDarkMode);
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <button
      onClick={toggleDarkMode}
      className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 transition-colors shadow-sm bg-white dark:bg-zinc-900"
      aria-label="Toggle dark mode"
      title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkMode ? (
        <Sun className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
      ) : (
        <Moon className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
      )}
    </button>
  );
}
