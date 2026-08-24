import { Button, Tooltip } from "@idds/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

export default function ThemeToggleButton({ className = "", placement = "bottom" }) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Gunakan mode terang" : "Gunakan mode gelap";

  return (
    <Tooltip variant="basic" title={label} placement={placement} showArrow={true}>
      <Button
        hierarchy="tertiary"
        size="sm"
        className={`kms-theme-toggle ${className}`.trim()}
        onClick={toggleTheme}
        aria-label={label}
        aria-pressed={isDark}
      >
        {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </Button>
    </Tooltip>
  );
}
