import {EventType, generateSubscriber, generatePublishers} from "@pubsubjs/core";
import {z} from "zod";
import {DependencyList, useEffect} from "react";
import {capitalize} from "./utils";
import {Hooks} from "./types";


export default function generateHooks<T extends Array<EventType>>(events: T): Hooks<T>{
    const subscriber = generateSubscriber(events);
    const publisher = generatePublishers(events, (event, data) => {
        return subscriber.handle(event.name, data);
    });

    return events.reduce((acc, event) => {
        return {
            ...acc,
            [`use${capitalize(event.name)}`]: (fn: (data: z.infer<typeof event.schema>) => Promise<void> | void, dependencies: DependencyList) => {
                return useEffect(() => {
                    return subscriber.on(event.name, fn);
                }, dependencies)
            }
        }
    }, {
        ...publisher
    }) as Hooks<T>
}
