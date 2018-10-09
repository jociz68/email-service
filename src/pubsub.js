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


// Creates the new topic
pubsubClient
  .createTopic(topicName)
  .then(results => {
    const topic = results[0];
    console.log(`Topic ${topic.name} created.`);
  })
  .then(sync => {

  })
  .catch(err => {
    console.error('ERROR:', err);
  });

pubsubClient
  .topic(topicName)
  .createSubscription(subscriptionName)
  .then(results => {
    const subscription = results[0];
    console.log(`Subscription ${subscriptionName} created.`);
  })
  .then(sync => {

  })
  .catch(err => {
    console.error('ERROR:', err);
  });

  function trimChar(string, charToRemove) {
    while(string.charAt(0)==charToRemove) {
        string = string.substring(1);
    }

    while(string.charAt(string.length-1)==charToRemove) {
        string = string.substring(0,string.length-1);
    }

    return string;
}
function listenForMessages(subscriptionName, timeout) {

  // References an existing subscription
  const subscription = pubsubClient.subscription(subscriptionName);

  // Create an event handler to handle messages
  let messageCount = 0;
  const messageHandler = message => {
    console.log(`Received message ${message.id}:`);
    console.log(`\tData: ${message.data}`);
    console.log(`\tAttributes: ${message.attributes}`);
    messageCount += 1;

    try {
      var payload = message.data.toString();
      var trimed = trimChar(payload,"'");
      var jsonPayload = JSON.parse(trimed);
      const result = Joi.validate(jsonPayload, schema)

      if (result.error) {
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
          logger.info(response)
        })
        .catch(err => {
          throw (err)
        })
      logger.info("processed a message");
    } catch (err) {
      logger.error(err)
    }

    // "Ack" (acknowledge receipt of) the message
    message.ack();
  };

  // Listen for new messages until timeout is hit
  subscription.on(`message`, messageHandler);
  // setTimeout(() => {
  //   subscription.removeListener('message', messageHandler);
  //   console.log(`${messageCount} message(s) received.`);
  // }, timeout * 1000);
}

listenForMessages(subscriptionName);
