import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariantsOuter = cva('rounded-full transition duration-300 ease-in-out', {
  variants: {
    variant: {
      primary: 'w-full shadow-[0_16px_32px_-8px_rgba(0,0,0,0.35)]',
      accent: 'w-full shadow-[0_16px_32px_-8px_rgba(99,102,241,0.4)]',
      brand: 'w-full shadow-[0_16px_32px_-8px_rgba(5,108,242,0.4)]',
      destructive: 'w-full shadow-[0_16px_32px_-8px_rgba(239,68,68,0.4)]',
      secondary: 'w-full border border-brand-950/10 shadow-[0_16px_32px_-8px_rgba(0,0,0,0.12)]',
      minimal: 'group/texture-button w-full border border-brand-950/10',
      icon: 'group/texture-button border border-brand-950/10',
    },
    size: {
      sm: '',
      default: '',
      lg: '',
      icon: '',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

const innerDivVariants = cva(
  'w-full h-full flex items-center justify-center text-muted-foreground',
  {
    variants: {
      variant: {
        primary: 'gap-2 bg-neutral-900 text-sm text-white/90 transition-colors hover:bg-neutral-800 active:bg-black',
        accent: 'gap-2 bg-indigo-500 text-sm text-white/90 transition-colors hover:bg-indigo-600 active:bg-indigo-700',
        brand:
          'gap-2 bg-brand-500 text-sm text-[color:var(--qt-button-text,rgba(255,255,255,0.9))] transition-colors hover:bg-brand-400 active:bg-brand-800',
        destructive: 'gap-2 bg-red-500 text-sm text-white/90 transition-colors hover:bg-red-600 active:bg-red-700',
        secondary: 'bg-white text-sm text-brand-950 transition-colors hover:bg-brand-950/5 active:bg-brand-950/10',
        minimal:
          'bg-white text-sm text-brand-950 transition-colors group-hover/texture-button:bg-brand-950/5 group-active/texture-button:bg-brand-950/10',
        icon: 'bg-white text-brand-950 group-active/texture-button:bg-brand-950/10 rounded-full',
      },
      size: {
        sm: 'text-xs rounded-full px-4 py-1',
        default: 'text-sm rounded-full px-5 py-2.5',
        lg: 'text-base rounded-full px-6 py-3',
        icon: 'rounded-full p-1',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface UnifiedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'brand'
    | 'destructive'
    | 'minimal'
    | 'icon';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

const TextureButton = React.forwardRef<HTMLButtonElement, UnifiedButtonProps>(
  (
    { children, variant = 'primary', size = 'default', asChild = false, className, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariantsOuter({ variant, size }), className)}
        ref={ref}
        {...props}
      >
        <div className={cn(innerDivVariants({ variant, size }))}>{children}</div>
      </Comp>
    );
  }
);

TextureButton.displayName = 'TextureButton';

export { TextureButton };
