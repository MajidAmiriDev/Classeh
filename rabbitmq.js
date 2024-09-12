const amqp = require('amqplib');

const RABBITMQ_URL = 'amqp://localhost'; // یا آدرس RabbitMQ شما

let channel = null;

const connectRabbitMQ = async () => {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
};

const sendToQueue = async (queue, message) => {
    try {
        if (!channel) {
            await connectRabbitMQ();
        }
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
        console.log(`Message sent to queue ${queue}`);
    } catch (error) {
        console.error('Error sending message to RabbitMQ:', error);
    }
};

const consumeFromQueue = async (queue, callback) => {
    try {
        if (!channel) {
            await connectRabbitMQ();
        }
        await channel.assertQueue(queue, { durable: true });
        channel.consume(queue, (msg) => {
            if (msg !== null) {
                const message = JSON.parse(msg.content.toString());
                callback(message);
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error('Error consuming message from RabbitMQ:', error);
    }
};

module.exports = { sendToQueue, consumeFromQueue };