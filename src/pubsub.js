#!/usr/bin/env node

require('./setenv');
// Imports the Google Cloud client library
const PubSub = require('@google-cloud/pubsub');
const bodyParser = require('body-parser')
const Joi = require('joi')
const env = require('./utils/env')({})

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
const myFormat = printf(info => {
  var messageJson = JSON.stringify(info.message)
  return `${info.timestamp} [${info.label}] ${info.level}: ${messageJson}`;
});
const logger = createLogger({
  format: combine(
    label({ label: 'mailer' }),
    timestamp(),
    myFormat
  ),
  transports: [new transports.Console()]
})

const schema = Joi.object().keys({
  templateName: Joi.string().required(),
  templateOptions: Joi.object().required(),
  emailOptions: Joi.object().required(),
  language: Joi.string()
})


// Your Google Cloud Platform project ID
const projectId = env('PUBSUB_GOOGLE_PROJECT_ID');
const topicName = env('PUBSUB_TOPIC_NAME');
const subscriptionName = env('PUBSUB_SUBSCRIPTION_NAME');

const pubsubClient = new PubSub({
  projectId: projectId,
});


function listenForMessages(subscriptionName, timeout) {
  const service = require('./email')(env)
  const subscription = pubsubClient.subscription(subscriptionName);
  
  let messageCount = 0;
  let succeededMessageCount = 0;
  let failedMessageCount = 0;
  const messageHandler = message => {
    logger.info(`Received message id: ${message.id}`);
    logger.info(`Data received: ${message.data}`);
    messageCount += 1;

    try {
      logger.info(`total count: ${messageCount} succeeded message count: ${succeededMessageCount} failed message count: ${failedMessageCount}`);
      var payload = message.data.toString();
      var jsonPayload = JSON.parse(payload);
      const result = Joi.validate(jsonPayload, schema)

      if (result.error) {
        failedMessageCount += 1;
        throw (result.error)
      }
      const {
        emailOptions,
        templateName,
        templateOptions,
        language
      } = jsonPayload
      var prom = service.sendTemplatedEmail(emailOptions, templateName, templateOptions, language)
        .then(response => {
          succeededMessageCount += 1;
          logger.info(response)
          logger.info(`Processed a message id: ${message.id}, total count: ${messageCount} succeeded message count: ${succeededMessageCount}`);
        })
        .catch(err => {
          failedMessageCount += 1;
          throw (err)
        })
    } catch (err) {
      logger.error(err)
    }
    // "Ack" (acknowledge receipt of) the message
    message.ack();
  };
  // Listen for new messages until timeout is hit
  subscription.on(`message`, messageHandler);
}

pubsubClient
  .createTopic(topicName)
  .then(results => {
    const topic = results[0];
    logger.info(`Topic ${topic.name} created.`);
  })
  .catch(err => {
    logger.error(err);
  })
  .then(() => {
    pubsubClient
      .topic(topicName)
      .createSubscription(subscriptionName, {
        ackDeadlineSeconds: 90
      })
      .then(results => {
        const subscription = results[0];
        logger.info(`Subscription ${subscriptionName} created.`);
      })
      .catch(err => {
        logger.error(err);
      });
  })
  .then(() => {
    listenForMessages(subscriptionName);
  })