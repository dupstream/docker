FROM node:alpine
WORKDIR /src
EXPOSE 3978/tcp
ENTRYPOINT ["node", "index.js"]
COPY . /src
RUN npm install