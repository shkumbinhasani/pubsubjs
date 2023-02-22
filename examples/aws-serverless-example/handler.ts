import {generateSubscriber} from "@pubsubjs/core";
import events from "./events";

const subscriberApp = generateSubscriber(events);
subscriberApp.onUserRegistered((data) => {
    console.log('New user registered: '+data.email);
    console.log(data);
});

export default subscriberApp;
