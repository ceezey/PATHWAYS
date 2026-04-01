FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pathways/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@pathways/web", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
