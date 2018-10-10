#!/usr/bin/env node

// require('./setenv');
require('./PromisePolyfillFinally')
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
  Uid: Joi.string().required(),
  language: Joi.string()
})


// Your Google Cloud Platform project ID
const projectId = env('PUBSUB_GOOGLE_PROJECT_ID');
const topicName = env('PUBSUB_SVC_TOPIC_NAME');
const topicNameToReply = env('PUBSUB_REPLY_TOPIC_NAME');
const subscriptionName = env('PUBSUB_SUBSCRIPTION_NAME');

const pubsubClient = new PubSub({
  projectId: projectId,
});


function listenForMessages(subscriptionName, timeout) {
  const service = require('./email')(env)
  const subscription = pubsubClient.subscription(subscriptionName);
  logger.info(`subscription on ${subscriptionName}`);
  let messageCount = 0;
  let succeededMessageCount = 0;
  let failedMessageCount = 0;
  const messageHandler = pubSubMessage => {
    logger.info(`Received message id: ${pubSubMessage.id}`);
    logger.info(`Data received: ${pubSubMessage.data}`);
    messageCount += 1;

    try {
      logger.info(`total count: ${messageCount} succeeded message count: ${succeededMessageCount} failed message count: ${failedMessageCount}`);
      var payload = pubSubMessage.data.toString();
      var jsonPayload = JSON.parse(payload);
      const result = Joi.validate(jsonPayload, schema)

      if (result.error) {
        failedMessageCount += 1;
        var code = 500;
        var message = `Failed to send the message. Error: ${result.error}`;
        replyMessage(topicNameToReply, jsonPayload.Uid, code, message);
        throw (result.error)
      }
      const {
        emailOptions,
        templateName,
        templateOptions,
        language,
        Uid
      } = jsonPayload
      var prom = service.sendTemplatedEmail(emailOptions, templateName, templateOptions, language)
        .then(response => {
          var code = 200;
          var message = "Message has been sent";
          replyMessage(topicNameToReply, Uid, code, message);
          succeededMessageCount += 1;
          logger.info(response);
          logger.info(`Processed a message id: ${message.id} API uid:${Uid}, total count: ${messageCount} succeeded message count: ${succeededMessageCount}`);
        })
        .catch(err => {
          failedMessageCount += 1;
          var code = 500;
          var message = `Failed to send the message. Error: ${err}`;
          replyMessage(topicNameToReply, Uid, code, message);
          logger.error(`Failed to process a message id: ${message.id} API uid:${Uid}, total count: ${messageCount} succeeded message count: ${succeededMessageCount}`);
          throw (err)
        })
    } catch (err) {
      logger.error(err)
    }
    // "Ack" (acknowledge receipt of) the message
    pubSubMessage.ack();
  };
  // Listen for new messages until timeout is hit
  subscription.on(`message`, messageHandler);
}

function replyMessage(replyTopicName, uid, code, message) {
  // Creates a client
  const pub = new PubSub({
    projectId: projectId,
  });
  var data = {}
  data.Uid = uid;
  data.Code = code;
  data.Reply = message;
  var jsonContent = JSON.stringify(data)
  const dataBuffer = Buffer.from(jsonContent);
  pub
    .topic(replyTopicName)
    .publisher()
    .publish(dataBuffer)
    .then(messageId => {
      logger.info(`Message uid:${data.Uid} has been replied`);
    })
    .catch(err => {
      logger.error(err);
    });
}

var initiates = [
  // create service topic
  new Promise((resolve) => {
    pubsubClient
      .createTopic(topicName)
      .then(results => {
        const topic = results[0];
        logger.info(`Service topic ${topic.name} has been created.`);
      })
      .catch(err => {
        logger.error(`Failed to create service topic ${topicName}.`);
        logger.error(err);
      })
      .finally(end => {
        resolve()
      })
  }),
  // create reply topic
  new Promise((resolve) => {
    pubsubClient
      .createTopic(topicNameToReply)
      .then(results => {
        const topic = results[0];
        logger.info(`Reply topic ${topic.name} has been created.`);
      })
      .catch(err => {
        logger.error(`Failed to create reply topic ${topicNameToReply}.`);
        logger.error(err);
      })
      .finally(end => {
        resolve()
      })
  }),
  // create subscription
  new Promise((resolve) => {
    pubsubClient
      .topic(topicName)
      .createSubscription(subscriptionName, {
        ackDeadlineSeconds: 90
      })
      .then(results => {
        const subscription = results[0];
        logger.info(`Subscription ${subscription} has been created.`);
      })
      .catch(err => {
        logger.error(`Failed to create subscription ${subscriptionName} for ${topicName}.`);
        logger.error(err);
      })
      .finally(end => {
        resolve()
      })
  })
];

async function CreatePubSubArtifacts() {
  // create PubSub artifacts synchronously
  var done = await Promise.all(initiates.map(async item => { await item }));
  listenForMessages(subscriptionName)
}
// process incoming requests
CreatePubSubArtifacts();
