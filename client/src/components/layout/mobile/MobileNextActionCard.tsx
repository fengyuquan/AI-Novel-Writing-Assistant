import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MobileNextActionCardProps = {
  title: ReactNode;
  description?: ReactNode;
  primaryLabel: ReactNode;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryHref?: string;
  secondaryLabel?: ReactNode;
  onSecondary?: () => void;
  secondaryHref?: string;
  className?: string;
  tone?: "default" | "warning" | "destructive";
};

const toneClassName: Record<NonNullable<MobileNextActionCardProps["tone"]>, string> = {
  default: "border-primary/25 bg-primary/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  destructive: "border-destructive/30 bg-destructive/5",
};

export function MobileNextActionCard({
  title,
  description,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryHref,
  secondaryLabel,
  onSecondary,
  secondaryHref,
  className,
  tone = "default",
}: MobileNextActionCardProps) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border p-3",
        toneClassName[tone],
        className,
      )}
    >
      <div className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{title}</div>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {primaryHref ? (
          <Button asChild className="h-11 min-h-11 w-full text-base" disabled={primaryDisabled}>
            <Link to={primaryHref}>{primaryLabel}</Link>
          </Button>
        ) : (
          <Button
            className="h-11 min-h-11 w-full text-base"
            disabled={primaryDisabled}
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
        )}
        {secondaryLabel != null ? (
          secondaryHref ? (
            <Button asChild variant="outline" className="h-11 min-h-11 w-full text-base">
              <Link to={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-11 min-h-11 w-full text-base"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </Button>
          )
        ) : null}
      </div>
    </section>
  );
}
