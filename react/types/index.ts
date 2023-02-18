import {DataType, EventType, Publisher} from "@pubsubjs/core";
import {DependencyList} from "react";

export type Hooks<T extends Array<EventType>> = {
    [K in T[number]['name'] as `use${Capitalize<K>}`]: (fn: (data: DataType<T[number], K>) => void | Promise<void>, dependencies: DependencyList) => unknown;
} & Publisher<T>
