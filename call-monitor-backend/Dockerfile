FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache espeak-ng sox
COPY package.json .
RUN npm install --production
COPY --chown=node:node . .
USER node
EXPOSE 4000
CMD ["node", "index.js"]
