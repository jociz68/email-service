FROM node:latest

# Create template folder
WORKDIR /azure

# Create app directory
WORKDIR /usr/src/app


# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY . .

EXPOSE 80

ENV TEMPLATES_DIR=/usr/src/app/example_templates
ENV OLD_TEMPLATES_DIR=/azure
ENV MICROSERVICE_PORT=80
ENV OLD_TRANSPORT=postmark
ENV TRANSPORT=smtp
ENV SMTP_HOST=10.10.10.78
ENV SMTP_PORT=25
ENV SMTP_USER=testuser
ENV SMTP_PASS=testpass
ENV POSTMARK_API_KEY="xxx"
ENV RABBITMQ_QUEUE='task_queue'
ENV RABBITMQ_URL='amqp://10.10.10.78'
ENV RABBITMQ_DURABLE_QUEUE="true"

CMD [ "npm", "run", "start-rabbit" ]