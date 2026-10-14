/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DashboardAction, DashboardItem } from '@/types/pathways'

import { ActionButton, DashboardListItem } from './dashboard-list-item'

// Stubs expose the tone and the label the item hands to the shared badge and bar.
vi.mock('@/components/pathways', () => ({
  StatusBadge: ({ tone, children }: { tone: string; children: React.ReactNode }) => (
    <span data-testid="badge" data-tone={tone}>
      {children}
    </span>
  ),
  ProgressBar: ({ label, tone, value }: { label?: string; tone: string; value: number }) => (
    <div data-testid="bar" data-label={label ?? ''} data-tone={tone} data-value={value} />
  ),
}))

const act = (overrides: Partial<DashboardAction> = {}) =>
  ({ id: 'go', label: 'Open', kind: 'navigate', href: '/x', ...overrides }) as DashboardAction
const item = (overrides: Partial<DashboardItem> = {}) =>
  ({
    id: 'item-1',
    title: 'Synthetic item',
    description: 'Synthetic description',
    ...overrides,
  }) as DashboardItem

afterEach(() => {
  cleanup()
})

describe('ActionButton', () => {
  it('reports the action it shows when clicked', () => {
    const onAction = vi.fn()
    const action = act()
    render(<ActionButton action={action} onAction={onAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith(action)
  })

  it.each([
    ['navigate', 1],
    ['dialog', 0],
    ['submit', 0],
  ])('draws %s actions with %s arrows', (kind, arrows) => {
    render(<ActionButton action={act({ kind } as never)} onAction={vi.fn()} />)

    expect(screen.getByRole('button').querySelectorAll('svg')).toHaveLength(arrows)
  })

  it('is a small button that does not submit a form', () => {
    render(<ActionButton action={act()} onAction={vi.fn()} />)

    const button = screen.getByRole('button')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('gap-2')).toBe(true)
    expect(button.classList.contains('h-9')).toBe(true)
  })

  it.each([
    [undefined, false, true],
    ['outline', false, true],
    ['default', true, false],
    ['secondary', false, true],
  ] as const)('with variant %s is filled: %s, outlined: %s', (variant, filled, outlined) => {
    render(<ActionButton action={act()} onAction={vi.fn()} variant={variant} />)

    const button = screen.getByRole('button')
    expect(button.classList.contains('bg-primary')).toBe(filled)
    expect(button.classList.contains('border-primary')).toBe(outlined)
  })
})

describe('DashboardListItem', () => {
  it('shows a plain title, the description and no meta, status or bar by default', () => {
    render(<DashboardListItem item={item()} onAction={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Synthetic item')
    expect(screen.getByText('Synthetic description')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByTestId('badge')).toBeNull()
    expect(screen.queryByTestId('bar')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('links the title when the item has an address', () => {
    render(<DashboardListItem item={item({ href: '/projects/p1' })} onAction={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Synthetic item' }).getAttribute('href')).toBe(
      '/projects/p1',
    )
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('shows the meta line only when there is one', () => {
    render(<DashboardListItem item={item({ meta: 'Due 12 Oct' })} onAction={vi.fn()} />)

    expect(screen.getByText('Due 12 Oct')).toBeTruthy()
  })

  it.each([
    ['danger', 'danger'],
    ['warning', 'warning'],
    ['success', 'success'],
    ['neutral', 'neutral'],
    ['info', 'info'],
    [undefined, 'info'],
  ] as const)('gives a %s status the %s badge', (severity, tone) => {
    render(<DashboardListItem item={item({ status: 'Open', severity })} onAction={vi.fn()} />)

    expect(screen.getByTestId('badge').textContent).toBe('Open')
    expect(screen.getByTestId('badge').getAttribute('data-tone')).toBe(tone)
  })

  it.each([
    [0, 'Progress', 'mt-4'],
    [40, 'Progress', 'mt-4'],
  ])('shows a bar for progress %s with its label', (progress, label, spacing) => {
    render(<DashboardListItem item={item({ progress, severity: 'warning' })} onAction={vi.fn()} />)

    const bar = screen.getByTestId('bar')
    expect(bar.getAttribute('data-value')).toBe(String(progress))
    expect(bar.getAttribute('data-label')).toBe(label)
    expect(bar.getAttribute('data-tone')).toBe('warning')
    expect(bar.parentElement?.className).toBe(spacing)
  })

  it('narrows the bar and drops its label in the compact layout', () => {
    render(<DashboardListItem compact item={item({ progress: 40 })} onAction={vi.fn()} />)

    expect(screen.getByTestId('bar').getAttribute('data-label')).toBe('')
    expect(screen.getByTestId('bar').getAttribute('data-tone')).toBe('info')
    expect(screen.getByTestId('bar').parentElement?.className).toBe('mt-3 sm:max-w-[220px]')
  })

  it('shows no bar for progress that is not a number', () => {
    render(<DashboardListItem item={item({ progress: undefined })} onAction={vi.fn()} />)

    expect(screen.queryByTestId('bar')).toBeNull()
  })

  it('shows the primary action filled and the secondary one outlined, in that order', () => {
    const onAction = vi.fn()
    const primary = act({ id: 'p', label: 'Primary' })
    const secondary = act({ id: 's', label: 'Secondary' })
    render(
      <DashboardListItem
        item={item({ primaryAction: primary, secondaryAction: secondary })}
        onAction={onAction}
      />,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Primary', 'Secondary'])
    expect(buttons[0].classList.contains('bg-primary')).toBe(true)
    expect(buttons[1].classList.contains('bg-primary')).toBe(false)
    fireEvent.click(buttons[1])
    expect(onAction).toHaveBeenCalledWith(secondary)
  })

  it.each([
    ['primary', { primaryAction: act({ label: 'Only' }) }],
    ['secondary', { secondaryAction: act({ label: 'Only' }) }],
  ])('shows a lone %s action', (_name, actions) => {
    render(<DashboardListItem item={item(actions)} onAction={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
