import {EventHandler, EventType, Publisher} from "../types";
import {capitalize} from "../utils";
import {z} from "zod";
export default function generatePublishers<T extends Array<EventType>>(events: T, publishFunction: EventHandler<T>): Publisher<T> {
    return events.reduce((acc, event) => {
        return {
            ...acc,
            [`publish${capitalize(event.name)}`]: async (data: z.infer<typeof event.schema>) => {
                const parsedData = event.schema.parse(data);
                await publishFunction(event, parsedData);
            }
        }
    }, {}) as Publisher<T>
}
