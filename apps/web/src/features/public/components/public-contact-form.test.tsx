/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ContactForm } from './public-contact-form'

describe('contact form', () => {
  afterEach(cleanup)

  it('flags missing fields and accepts a complete message without sending it', () => {
    render(<ContactForm />)
    fireEvent.click(screen.getByRole('button', { name: /Send message/ }))
    expect(screen.getByText('Enter your name.')).toBeTruthy()
    expect(screen.getByLabelText('Work email').getAttribute('aria-invalid')).toBe('true')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Synthetic Person' } })
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'team@example.org' } })
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'Pilot' } })
    fireEvent.change(screen.getByLabelText('How can we help?'), {
      target: { value: 'We want to explore a pilot for our monitoring workflow.' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Send message/ }))
    expect(screen.getByText('Thank you for reaching out.')).toBeTruthy()
    expect(screen.getByText(/it was not sent/)).toBeTruthy()
  })
})
