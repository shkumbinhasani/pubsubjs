import {generatePublishers} from "@pubsubjs/core";
import {serverlessPublisherFunction} from "@pubsubjs/serverless-adapter";
import AWS from "aws-sdk";
import events from "./events";
const sns = new AWS.SNS();


const publisher = generatePublishers(events, serverlessPublisherFunction({
    sns,
    accountId: process.env.ACCOUNT_ID ?? '',
    region: process.env.REGION ?? '',
}));

export const registerUser = () => {
    // Logic to register user

    publisher.publishUserRegistered({
        fullName: 'John Doe',
        email: 'johndoe@gmail.com'
    });
}
