import events from "./events";
import subscriberApp from "./handler";
import {pubSubJSServerlessAdapter} from "@pubsubjs/serverless-adapter";

const adapter = pubSubJSServerlessAdapter(events, subscriberApp);

export = adapter;
