import { EventType } from "./types";
import { z } from "zod";
import {generateSubscriber} from "./generators/generateSubscribers";



const hiEvent = {
    name: "hi",
    schema: z.object({
        test: z.string().min(2)
    })
} as const satisfies EventType

const hmmEvent = {
    name: "hmm",
    schema: z.object({
        aKaBoHmm: z.boolean()
    })
} as const satisfies EventType

const events = [hiEvent, hmmEvent]

const subscriber = generateSubscriber(events);

subscriber.onHi((data) => {
    console.log(data);
});
