import {z, ZodSchema, ZodType} from "zod";

export interface EventType {
    name: string,
    prefix?: string,
    schema: ZodSchema<any, any, any>
}

export type FunctionOfKey<T extends EventType, K extends string> = T extends { name: K, schema: infer D extends ZodType<any, any, any> } ? (callback: (data: z.infer<D>) => Promise<void> | void) => () => void : never

export type DataType<T extends EventType, K extends string> = T extends { name: K, schema: infer D extends ZodType<any, any, any> } ? z.infer<D> : never

export type Subscriber<E extends Array<EventType>> = {
    [K in E[number]['name']as `on${Capitalize<K>}`]: FunctionOfKey<E[number], K>;
} & {
    on: <T extends E[number]['name']>(event: T, callback: (data: DataType<E[number], T>) => Promise<void> | void) => () => void
    handle: <T extends E[number]['name']>(event: T, data: DataType<E[number], T>) => Promise<void> | void;
    getSubscribedEvents: () => Array<EventType>
}

export type EventHandler<E extends Array<EventType>> = <T extends E[number]>(event: T, data: DataType<E[number], T['name']>) => Promise<void> | void;


export type Publisher<E extends Array<EventType>> = {
    [K in E[number]['name']as `publish${Capitalize<K>}`]: (data: DataType<E[number], K>) => Promise<void> | void
}
