import {APIGatewayEvent, APIGatewayProxyCallback, Context} from "aws-lambda";
import {generatePublishers} from "@pubsubjs/core";
import AWS from "aws-sdk";
import events from "./events";
import {serverlessPublisherFunction} from "@pubsubjs/serverless-adapter";
const sns = new AWS.SNS();


const publisher = generatePublishers(events, serverlessPublisherFunction({
    sns,
    accountId: process.env.ACCOUNT_ID ?? '',
    region: process.env.REGION ?? '',
}));

export async function httpApi(event: APIGatewayEvent, context: Context, callback: APIGatewayProxyCallback) {
    publisher.publishUserRegistered({
        fullName: 'John Doe',
        email: 'johndoe@gmail.com',
    });

    callback(null, {
        statusCode: 200,
        body: JSON.stringify({}),
    });
}
