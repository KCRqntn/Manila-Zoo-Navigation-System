import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppCtx } from "@/contexts/AppContext";

/**
 * A password box with an eye button that shows or hides what was typed. Each box keeps its own
 * state, so the login, password and repeat-password boxes toggle independently. The button never
 * submits the form, and the browser's own reveal icon (Edge) is hidden so there is only one eye.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<typeof Input>, "type">>(
  ({ className, ...props }, ref) => {
    const { language } = useAppCtx();
    const fil = language === "fil";
    const [visible, setVisible] = useState(false);
    const label = visible ? (fil ? "Itago ang password" : "Hide password") : (fil ? "Ipakita ang password" : "Show password");
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? "text" : "password"} className={cn("password-input pr-10", className)} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...props} />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          // Keep the cursor in the box while toggling
          onMouseDown={e => e.preventDefault()}
          aria-label={label}
          aria-pressed={visible}
          aria-controls={props.id}
          title={label}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
