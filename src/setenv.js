process.env['TEMPLATES_DIR'] = 'D:\\repos\\email-service\\example_templates';
// process.env['TRANSPORT'] = 'postmark';
process.env['TRANSPORT'] = 'smtp';
process.env['POSTMARK_API_KEY'] = 'c8ff5232-7a00-4a95-9b70-b210a6fb26bf';
process.env['RABBITMQ_QUEUE'] = 'task_queue1';
process.env['RABBITMQ_URL'] = 'amqp://localhost';
process.env['RABBITMQ_DURABLE_QUEUE'] = "true";
process.env['SMTP_HOST'] = '10.10.10.78';
process.env['SMTP_PORT'] = '25';
process.env['SMTP_USER'] = 'testuser';
process.env['SMTP_PASS'] = 'testpass';
