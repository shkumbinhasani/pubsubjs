import {APIGatewayEvent, APIGatewayProxyCallback, Context} from "aws-lambda";
import {EventType, generatePublishers} from "@pubsubjs/core";
import AWS from "aws-sdk";
import events from "./events";
const sns = new AWS.SNS();
async function serverlessPublisherFunction(events: Array<EventType>){
    // @ts-ignore
    return generatePublishers(events, (event, data) => {
        // @ts-ignore
        const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
        // @ts-ignore
        const AWS_REGION = process.env.AWS_REGION;
        return sns.publish({
            TopicArn: `arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:${event?.prefix || ''}${event.name}`,
            Message: JSON.stringify(data)
        }).promise();
    })
}

// @ts-ignore
const publisher = generatePublishers(events, serverlessPublisherFunction(events));

export async function httpApi(event: APIGatewayEvent, context: Context, callback: APIGatewayProxyCallback) {
    publisher.publishMiesenPart({message: 'Hello from Lambda Testing service with prefixes and stuff!'});

    callback(null, {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from Lambda!',
            input: event,
        }),
    });
}
