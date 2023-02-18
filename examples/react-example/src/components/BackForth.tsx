import {PubSub} from "../events";

export default function BackForth(){
    return <>
        <button>Back</button>
        <button onClick={() => {
            PubSub.publishNextImage(null);
        }}>Next</button>
    </>
}
