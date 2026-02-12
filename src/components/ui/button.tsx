import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default:
                    "bg-white/10 text-white hover:bg-white/20 border border-white/10",
                gradient:
                    "bg-gradient-to-r from-[hsl(268,95%,50%)] to-[hsl(189,100%,50%)] text-white hover:opacity-90 shadow-lg hover:shadow-xl",
                ghost:
                    "text-white/70 hover:text-white hover:bg-white/5",
                outline:
                    "border border-white/20 text-white hover:bg-white/10",
                destructive:
                    "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30",
                success:
                    "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30",
                link:
                    "text-[hsl(268,95%,50%)] underline-offset-4 hover:underline",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-8 px-3 text-xs",
                lg: "h-12 px-6 text-base",
                xl: "h-14 px-8 text-lg",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
