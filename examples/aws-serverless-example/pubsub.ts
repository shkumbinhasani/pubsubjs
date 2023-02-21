import {EventType, Subscriber} from "@pubsubjs/core";
import {SNSEvent} from "aws-lambda";
import events from "./events";
import subscriberApp from "./handler";

function pubSubJSServerlessAdapter<T extends Array<EventType>>(events: T, subscriber: Subscriber<T>) {
    return {
        handler: async function (event: SNSEvent) {
            for (const record of event.Records) {
                const message = JSON.parse(record.Sns.Message);
                const eventName = events.find(event => (event.prefix || "") + event.name === record.Sns.TopicArn.split(':').pop())?.name;
                // @ts-ignore
                await subscriber.handle(eventName, message);
            }
        },
        getResources: function () {
            return events.reduce((acc, event) => {
                const eventName = (event.prefix || "") + event.name;
                return {
                    ...acc,
                    [event.name]: {
                        Type: 'AWS::SNS::Topic',
                        Properties: {
                            TopicName: eventName,
                            DisplayName: eventName
                        }
                    }
                }
            }, {});
        },
        getOutputFile: function () {
            return events.reduce((acc, event) => {

                return {
                    ...acc,
                    [event.name]: {
                        Value: {
                            Ref: event.name
                        }
                    }
                }
            }, {});
        },
        getSubscribedEvents: function () {
            return subscriber.getSubscribedEvents().map(event => {
                const eventName = (event.prefix || "") + event.name;
                return {
                    sns: `arn:aws:sns:\${self:provider.region}:\${aws:accountId}:${eventName}`
                }
            });
        }
    }
}

const adapter = pubSubJSServerlessAdapter(events, subscriberApp);

export = adapter;
