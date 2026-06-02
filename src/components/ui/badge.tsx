import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

