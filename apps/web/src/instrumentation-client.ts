import { z } from 'zod'

// Next runs this file before any page code builds a schema; the content security policy refuses and reports zod's new Function probe.
z.config({ jitless: true })
