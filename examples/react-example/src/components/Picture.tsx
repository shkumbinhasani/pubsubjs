import {useEffect, useState} from "react";
import {PubSub} from "../events";

interface Product {
    id: number,
    title: string,
    thumbnail: string
}
export default function Picture() {
    const [products, setProducts] = useState<Product[]>();
    const [currentProduct, setCurrentProduct] = useState<number>(0);

    useEffect(() => {
        fetch('https://dummyjson.com/products/')
            .then(res => res.json())
            .then(json => {
                console.log(json)
                setProducts(json.products)
            })
    }, [])

    PubSub.useNextImage(() => {
        setCurrentProduct((currentImage) => {
            console.log(currentImage + 1)
            return currentImage + 1
        })
    }, [])

    return products ? <div>
        <img src={products[currentProduct % products.length].thumbnail} alt={"hi"} />
        <h1>{products[currentProduct % products.length].title}</h1>
    </div>: <span>loading</span>
}
