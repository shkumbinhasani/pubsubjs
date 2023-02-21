import {generateSubscriber} from "@pubsubjs/core";
import events from "./events";

const subscriberApp = generateSubscriber(events);
subscriberApp.onMiesenPart((data) => {
    console.log('Received Hello Event: '+data.message);
    console.log(data);
});

export default subscriberApp;
