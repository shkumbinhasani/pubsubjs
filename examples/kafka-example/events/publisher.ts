import {Kafka} from "kafkajs";
import {generatePublishers} from "@pubsubjs/core";
import {kafkaPublisherFunction} from "@pubsubjs/kafka-adapter";
import events from "./index";

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['127.0.0.1:9092'],
    logLevel: 0
})

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: 'test-group' });
export const publisher = generatePublishers(events, kafkaPublisherFunction(producer));
