declare module 'gif.js/dist/gif.js' {

    export declare type Options = {
        workerScript?: string,
        workers?: number,
        repeat?: number,
        background?: string,
        quality?: number,
        width?: number,
        height?: number,
        transparent?: boolean,
        debug?: boolean,
        dither?: string
    };

    export declare type FrameOptions = {
        delay?: number,
        copy?: boolean,
        dispose?: number,
    };

    export declare interface GifJS {
        addFrame: (image: ImageData | HTMLCanvasElement | CanvasRenderingContext2D | WebGLRenderingContext, options?: FrameOptions) => void,
        on: (eventType: 'finished' | 'start' | 'progress' | 'abort', callback: (e:any) => void ) => void,
        render : () => void
    };

    declare const gifjs: new (options?: Options) => GifJS;

    export default gifjs;
}

/*
declare module 'gifshot' {

    const API = {
        'utils': utils$2,
        'error': error$2,
        'defaultOptions': defaultOptions$2,
        'createGIF': createGIF,
        'takeSnapShot': takeSnapShot,
        'stopVideoStreaming': stopVideoStreaming,
        'isSupported': isSupported,
        'isWebCamGIFSupported': isWebCamGIFSupported,
        'isExistingVideoGIFSupported': isExistingVideoGIFSupported,
        'isExistingImagesGIFSupported': isSupported$1,
        'VERSION': string
    };

    export = API;
}
*/