import {pubSubJSKafkaAdapter} from "@pubsubjs/kafka-adapter";
import {consumer, producer, publisher} from "./events/publisher";
import subscriber from "./pubSubApp";

pubSubJSKafkaAdapter(consumer, subscriber).then(() => console.log("Listening"));

(async () => {
    await consumer.connect()
    await producer.connect()

    await publisher.publishHmm({name: 'hmm'});
})()
