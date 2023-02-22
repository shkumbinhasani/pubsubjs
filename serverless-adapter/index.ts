import {Subscriber, EventType} from "@pubsubjs/core";
import {SNSEvent} from "aws-lambda";
import AWS from "aws-sdk";

export function pubSubJSServerlessAdapter<T extends Array<EventType>>(events: T, subscriber: Subscriber<T>) {
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

export function serverlessPublisherFunction<T extends Array<EventType>>(params: {
    sns: AWS.SNS,
    accountId: string,
    region: string,
    globalPrefix?: string
}){
    return async function <E extends EventType>(event: E, data: E['schema']['_output']) {
        const topicName = (params.globalPrefix || "") + (event.prefix || "") + event.name;
        const topicArn = `arn:aws:sns:${params.region}:${params.accountId}:${topicName}`;
        await params.sns.publish({
            TopicArn: topicArn,
            Message: JSON.stringify(data)
        }).promise();
    }
}
