import { cn } from "@/lib/utils";

export function Button({
  children,
  className,
  variant = "primary",
  type = "button",
  ...props
}: Readonly<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  }
>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
