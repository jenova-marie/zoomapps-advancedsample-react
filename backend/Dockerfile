FROM node:20

# Create app directory
WORKDIR /home/node/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

COPY wait-for-it.sh .
RUN chmod +x wait-for-it.sh

# Add custom CA certificate for TLS connections
COPY ca-cert.pem /usr/local/share/ca-certificates/recoverysky-root-ca.pem
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/recoverysky-root-ca.pem

CMD [ "npm", "start:dev" ]
