FROM public.ecr.aws/docker/library/node:20-slim

WORKDIR /app
RUN apt-get update && apt-get install -y curl

COPY package*.json ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production
ENV PORT=5004

EXPOSE 5004

CMD ["node", "server.js"]
