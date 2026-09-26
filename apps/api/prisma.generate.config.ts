import { defineConfig } from 'prisma/config'

// Client generation only reads the schema; database commands keep prisma.config.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
})
