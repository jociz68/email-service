#!/usr/bin/env node

// require('./setenv');
var amqp = require('amqplib/callback_api');
const bodyParser = require('body-parser')
const Joi = require('joi')

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


const env = require('./utils/env')({})
amqp.connect(env('RABBITMQ_URL'), function (err, conn) {
  conn.createChannel(function (err, ch) {

    const service = require('./email')(env)
    var queue = env('RABBITMQ_QUEUE');

    var durableQueue = env('RABBITMQ_DURABLE_QUEUE') == 'true';
    ch.assertQueue(queue, { durable: durableQueue });
    ch.prefetch(1);
    logger.info(" [*] Waiting for messages in '" + queue + "' message queue. To exit press CTRL+C");

    ch.consume(queue, function (msg) {

      try {
        var payload = msg.content.toString();
        var jsonPayload = JSON.parse(payload);
        const { body } = jsonPayload
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
    }, { noAck: true });
  });

});