import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        workspace: 'hsl(var(--workspace))',
        'surface-subtle': 'hsl(var(--surface-subtle))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-hover': 'hsl(var(--primary-hover))',
        'primary-active': 'hsl(var(--primary-active))',
        'primary-subtle': 'hsl(var(--primary-subtle))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        navy: 'hsl(var(--navy))',
        'navy-foreground': 'hsl(var(--navy-foreground))',
        'navy-muted': 'hsl(var(--navy-muted))',
        'light-blue': 'hsl(var(--light-blue))',
        'light-blue-foreground': 'hsl(var(--light-blue-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        link: 'hsl(var(--link))',
        success: 'hsl(var(--success))',
        'success-subtle': 'hsl(var(--success-subtle))',
        'success-foreground': 'hsl(var(--success-foreground))',
        warning: 'hsl(var(--warning))',
        'warning-subtle': 'hsl(var(--warning-subtle))',
        'warning-foreground': 'hsl(var(--warning-foreground))',
        danger: 'hsl(var(--danger))',
        'danger-hover': 'hsl(var(--danger-hover))',
        'danger-active': 'hsl(var(--danger-active))',
        'danger-subtle': 'hsl(var(--danger-subtle))',
        'danger-foreground': 'hsl(var(--danger-foreground))',
        info: 'hsl(var(--info))',
        'info-subtle': 'hsl(var(--info-subtle))',
        'info-foreground': 'hsl(var(--info-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        'disabled-foreground': 'hsl(var(--disabled-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        popover: '0 8px 20px rgb(11 46 79 / 10%), 0 1px 3px rgb(11 46 79 / 8%)',
        dialog: '0 16px 40px rgb(11 46 79 / 14%), 0 2px 6px rgb(11 46 79 / 8%)',
      },
      fontFamily: {
        heading: ['var(--font-heading)', '"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
