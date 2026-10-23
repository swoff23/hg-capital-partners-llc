"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { authInputClass } from "./auth-frame";

/**
 * A sign-in password field with a show and hide button inside its right edge
 * (decision 25, BPORTAL-012): a starting password is typed off a text message
 * on a phone, and typing it blind is where first sign-ins fail. Used on
 * /login, the reset link and the contractor's first password.
 *
 * The eye is a 44px target at every width. On touch screens the field keeps
 * 16px text (globals.css), so iOS doesn't zoom. Shown as text, the field
 * still doesn't capitalize, autocorrect or spell-check what's typed.
 */
export function PasswordField(props: Omit<React.ComponentProps<"input">, "type" | "className">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        // Edge draws its own reveal eye in a password field; this one replaces it.
        className={`${authInputClass} pr-11 [&::-ms-reveal]:hidden`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        // Leaves the caret in the field, so a phone's keyboard stays up.
        onMouseDown={(e) => e.preventDefault()}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        className="group absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-[#767d8a] outline-none transition-colors hover:text-[#e8eaee]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md group-focus-visible:ring-2 group-focus-visible:ring-[#c8a765]/50">
          {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
