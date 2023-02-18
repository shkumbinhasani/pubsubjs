import {DataType, EventType, Subscriber} from "../types";
import {capitalize} from "../utils";

export default function generateSubscriber<T extends EventType[]>(events: T): Subscriber<T> {
    const callbacks = new Map<string, Function[]>();
    return events.reduce((acc, event) => {
        return {
            ...acc,
            [`on${capitalize(event.name)}`]: (callback: (data: unknown) => Promise<void> | void) => {
                return acc.on(event.name, callback);
            }
        }
    }, {
        handle: async (name: string, data: unknown) => {
            const event = events.find(e => e.name === name);
            if (!event) {
                console.error(`Event ${event} not found`);
                return;
            }
            const parsedData = event.schema.parse(data);
            const key = name;
            if (!callbacks.has(key)) {
                return;
            }
            const callbacksForKey = callbacks.get(key);
            if (!callbacksForKey) {
                return;
            }
            for (const callback of callbacksForKey) {
                await callback(parsedData);
            }
        },
        getSubscribedEvents: () => {
            const eventNames = callbacks.keys();
            const subscribedEvents = [];
            for (const eventName of eventNames) {
                subscribedEvents.push(events.find(event => event.name === eventName));
            }
            return subscribedEvents
        },
        on: <E extends T[number]['name']>(name: E, callback: (data: DataType<T[number], E>) => Promise<void> | void) => {
            const key = name;
            if (!callbacks.has(key)) {
                callbacks.set(key, []);
            }
            callbacks.get(key)?.push(callback);

            return () => {
                const callbacksForKey = callbacks.get(key);
                if (!callbacksForKey) {
                    return;
                }
                const index = callbacksForKey.indexOf(callback);
                if (index > -1) {
                    callbacksForKey.splice(index, 1);
                }

                if (callbacksForKey.length === 0) {
                    callbacks.delete(key);
                }
            }
        }
    }) as Subscriber<T>
}
