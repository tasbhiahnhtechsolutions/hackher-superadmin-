import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#D1FAE5] text-[#065F46] hover:bg-[#D1FAE5] rounded-full font-semibold",
        secondary:
          "border-transparent bg-[#FEF3C7] text-[#92400E] hover:bg-[#FEF3C7] rounded-full font-semibold",
        destructive:
          "border-transparent bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FEE2E2] rounded-full font-semibold",
        outline: "border-[#E5E7EB] text-[#374151] rounded-full font-semibold",
        green: "border-transparent bg-[#D1FAE5] text-[#065F46] rounded-full font-semibold",
        amber: "border-transparent bg-[#FEF3C7] text-[#92400E] rounded-full font-semibold",
        red: "border-transparent bg-[#FEE2E2] text-[#991B1B] rounded-full font-semibold",
        purple: "border-transparent bg-[#E0E6F2] text-[#0F1A33] rounded-full font-semibold",
        orange: "border-transparent bg-[#FCE5D7] text-[#C4541E] rounded-full font-semibold",
        blue: "border-transparent bg-[#DBEAFE] text-[#1E40AF] rounded-full font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
