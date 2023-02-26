import {generateSubscriber} from "@pubsubjs/core";
import events from "./events";

const subscriber = generateSubscriber(events);

subscriber.onHmm((data) => {
    console.log(data.name);
});

export default subscriber;
