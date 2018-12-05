FROM node:alpine
WORKDIR /src
ENTRYPOINT ["node", "index.js"]
COPY . /src
RUN npm install