import {EventType, generatePublishers, generateSubscriber} from "@pubsubjs/core";
import {z} from "zod";

const testEvent = {
    name: 'test',
    schema: z.object({
        message: z.string()
    })
} as const satisfies EventType;

const events = [testEvent];

const subscriberApp = generateSubscriber(events);
const publisherApp = generatePublishers(events, (event, data) => {
    console.log(event, data);
});

subscriberApp.onTest((data) => {
    console.log('New user registered: '+data.message);
    console.log(data);
});

publisherApp.publishTest({message: 'Hello world!'});
