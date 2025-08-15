### ----------- Example Dockerfile -----------
### Cloud Run
# gcloud builds submit --ignore-file=.dockerignore --tag gcr.io/<projectid>/<tag> .
# gcloud run deploy btpi --image gcr.io/<projectid>/<tag> --port <port> --platform managed --region <region> --allow-unauthenticated

### Docker
## Build
# docker build -f Dockerfile -t btpi:1.1.3 .
## Attach to an image
# docker run -it --entrypoint /bin/bash btpi:1.1.3
## Start the container in detached mode
# docker run -it -d -p 3000:3000 --name BTPi btpi:1.1.3
# Attach
## docker exec -it BTPi /bin/bash

FROM node:24-bookworm-slim

# Match package.json version
LABEL version="1.1.3"

### Install a few necessary apps
RUN apt-get update && apt-get install -y nano less procps tzdata libterm-readline-gnu-perl ca-certificates

### Set our timezone
ENV TZ=America/Denver

### Optional: Use env variables for configuration
ENV DATABASE__SERVER="1.2.3.4"
ENV DATABASE__DATABASE="dbinstance"
ENV DATABASE__USER="myuser"
ENV DATABASE__PASSWORD="mypassword"
ENV DATABASE__OPTIONS__ENCRYPT="false"
ENV WMS_PROXY__HOST_PULSE="http://1.2.3.4:5678"
ENV WMS_PROXY__HOST_XMLEP="http://1.2.3.4:8910"
# Change in conjunction with the exposed port below
ENV BTPI__PORT=3000
# Default port to open on the container
EXPOSE 3000

# Use bash
SHELL ["/bin/bash", "-c"]
RUN echo "alias ll='ls -al'" >> /root/.bashrc

# Set the working directory in the container
WORKDIR /srv/BTPi

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install app dependencies
RUN npm install express mssql winston winston-daily-rotate-file winston moment-timezone node-schedule cors axios xml2js nconf

# Copy the rest of the application code (may require specifying --file-ignore=.dockerfile in the gcloud command)
COPY . .

# Define the command to run your app
CMD ["npm", "start"]