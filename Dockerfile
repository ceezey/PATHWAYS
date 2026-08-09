# syntax=docker/dockerfile:1

FROM node:22-alpine

WORKDIR /app

RUN npm install --global pnpm@11.20.0

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

ARG NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE=true
ARG NEXT_PUBLIC_ENABLE_ROLE_PREVIEW=true

ENV NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE=$NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE
ENV NEXT_PUBLIC_ENABLE_ROLE_PREVIEW=$NEXT_PUBLIC_ENABLE_ROLE_PREVIEW
ENV NODE_ENV=production

RUN pnpm --filter @pathways/web build

EXPOSE 3000

CMD ["pnpm", "--filter", "@pathways/web", "start"]
