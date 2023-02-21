import {PubSub} from "../events";

export default function BackForth(){
    return <>
        <button onClick={() => {
            PubSub.publishPreviousImage(null);
        }}>Back</button>
        <button onClick={() => {
            PubSub.publishNextImage(null);
        }}>Next</button>
    </>
}
