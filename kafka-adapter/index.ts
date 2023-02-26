import {Subscriber, EventType} from "@pubsubjs/core";
import {Consumer, EachMessagePayload, Producer} from "kafkajs";

export async function pubSubJSKafkaAdapter<T extends Array<EventType>>(consumer: Consumer, subscriber: Subscriber<T>) {
    const subscribedEvents = subscriber.getSubscribedEvents();
    subscribedEvents.forEach((event: EventType) => {
        const eventName = (event.prefix || "") + event.name;
        consumer.subscribe({ topic: eventName, fromBeginning: true });
    });

    await consumer.run({
        eachMessage: async (data: EachMessagePayload) => {
            const eventName = subscribedEvents.find((event: EventType) => (event.prefix || "") + event.name === data.topic)?.name;

            if (eventName) {
                const message = JSON.parse(data.message.value?.toString() ?? "");
                // @ts-ignore
                await subscriber.handle(eventName, message);
            }
        }
    })
}

export function kafkaPublisherFunction<T extends Array<EventType>>(producer: Producer){
    return async function <E extends EventType>(event: E, data: E['schema']['_output']) {
        const topicName = (event.prefix || "") + event.name;
        await producer.send({
            topic: topicName,
            messages: [
                {value: JSON.stringify(data)},
            ],
        })
    }
}
