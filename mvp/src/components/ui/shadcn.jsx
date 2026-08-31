import * as AccordionPrimitive from "@radix-ui/react-accordion";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { ChevronDown } from "reicon-react/icons/ChevronDown";
import { cn } from "../../lib/utils";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button--default",
      outline: "ui-button--outline",
      ghost: "ui-button--ghost",
    },
    size: {
      default: "ui-button--md",
      sm: "ui-button--sm",
      lg: "ui-button--lg",
      icon: "ui-button--icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }) {
  return <div className={cn("ui-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("ui-card__header", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("ui-card__content", className)} {...props} />;
}

export function Badge({ className, variant = "default", ...props }) {
  return <span className={cn("ui-badge", `ui-badge--${variant}`, className)} {...props} />;
}

export function Progress({ className, value = 0, ...props }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root className={cn("ui-progress", className)} value={safeValue} {...props}>
      <ProgressPrimitive.Indicator className="ui-progress__indicator" style={{ transform: `translateX(-${100 - safeValue}%)` }} />
    </ProgressPrimitive.Root>
  );
}

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }) {
  return <AccordionPrimitive.Item className={cn("ui-accordion__item", className)} {...props} />;
}

export function AccordionTrigger({ className, children, ...props }) {
  return (
    <AccordionPrimitive.Header className="ui-accordion__header">
      <AccordionPrimitive.Trigger className={cn("ui-accordion__trigger", className)} {...props}>
        {children}
        <ChevronDown className="ui-accordion__chevron" size={19} aria-hidden="true" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }) {
  return (
    <AccordionPrimitive.Content className="ui-accordion__content" {...props}>
      <div className={cn("ui-accordion__content-inner", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
