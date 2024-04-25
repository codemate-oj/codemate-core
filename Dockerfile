FROM node:20

WORKDIR /codemate-core/
COPY . .
RUN bash ./bootstrap.sh
ENTRYPOINT ["yarn", "start"]
