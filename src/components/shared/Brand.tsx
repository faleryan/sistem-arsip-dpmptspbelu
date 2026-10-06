import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/types/domain";

export function Brand({
  className,
  inverted = false,
  subtitle,
}: {
  className?: string;
  inverted?: boolean;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          inverted ? "bg-white text-navy-900" : "bg-navy-900 text-white",
        )}
      >
        <FileText className="h-5 w-5" aria-hidden />
      </div>
      <div className="leading-tight">
        <div className={cn("text-base font-bold tracking-wide", inverted ? "text-white" : "text-navy-900")}>
          {APP_NAME}
        </div>
        {subtitle ? (
          <div className={cn("text-[11px]", inverted ? "text-navy-200" : "text-muted-foreground")}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
