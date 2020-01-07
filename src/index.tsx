import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { Map, View, ImageCanvas, ImageBase } from 'ol';
import 'ol/ol.css';
import { useState, useRef, useMemo, useEffect } from 'react';
import { TranslateAutomata, ImageDataLattice, Environment, AverageAutomata, CellLattice2D, FullRangeAutomata, Lattice2D } from 'ca';
import OSM from 'ol/source/OSM';
import * as raster from 'ol/source/Raster';
//import ImageStatic from 'ol/source/ImageStatic';
import * as layer from 'ol/layer';
import * as extent from 'ol/extent';
import { ViewOptions } from 'ol/View';
import { TileWMS } from 'ol/source';
import ImageCanvasSource from 'ol/source/ImageCanvas';
import ImageSource, {Options} from 'ol/source/Image';
import Projection from 'ol/proj/Projection';
import { getHeight } from 'ol/extent';
import { rgbToHsl } from 'color-utils';
import {ReactControl, LayerList} from "./ol-helpers";
//import Event from 'ol/events/Event';
//import EventType from 'ol/events/EventType';

interface AppContext {

}

export const UserContext = React.createContext<AppContext>({});

export const App = () => (
    <BrowserRouter>
        <div>
            <Route
                exact
                path="/"
                render={props => {
                    return <MyMap />
                }
                }
            />
        </div>
    </BrowserRouter>
)


export class RenderedImagesContainer extends raster.default {
    private images: ImageData[];
    private output: ImageData;

    constructor(options: raster.Options) {
        super({
            ...options,
            operationType: "image",
            threads: 0, // necessary to prevent workers, until a solution is found to propagate this lib to workers
            operation: (data: ImageData[], globalObj) => {
                this.images = data as ImageData[];
                this.output = new ImageData(this.images[0].width, this.images[0].height);
                return this.output;
            },
        })
    }

    getImages() {
        return this.images;
    }
}

export type TerrainCell = {
    landtype?: string
    altitude: number;
    capacity?: number;

    // precomputed matrix of diffusion factors from/to neighbour cells
    // the sum of positive/negative cells must resp.  <1 / >-1
    diffusionMatrix: number[][];

}

export type TerrainCellStatus = {
    water_inner: number;
    water_outer: number;
}

export class TerrainLattice extends CellLattice2D<TerrainCell> {
    static createFromImages(dem: ImageData, landuse?: ImageData) {
        const demLattice = new ImageDataLattice(dem);
        const newLattice = new TerrainLattice(demLattice.getWidth(), demLattice.getHeight());

        // init terrain with altitude, ... 
        for (let y=0;y<newLattice.getHeight();y++) {
            for (let x=0;x<newLattice.getWidth();x++) {
                newLattice.set(x,y, TerrainLattice.initTerrainCellValues(x, y, demLattice) );
            }
        }

        // compute further attributes (diffusion matrix)
        for (let y=0;y<newLattice.getHeight();y++) {
            for (let x=0;x<newLattice.getWidth();x++) {
                this.computeDiffusionMatrix(x, y, newLattice);
            }
        }

        return newLattice;
    }

    static initTerrainCellValues(x: number, y:number, demLattice: ImageDataLattice): TerrainCell {

        const currentCell = demLattice.get(x,y);
        const altitude = 255-rgbToHsl(currentCell)[0];

        return {
            altitude,
            diffusionMatrix: [[NaN,NaN,NaN], [NaN, NaN, NaN], [NaN, NaN, NaN]]
        }
    }

    static computeDiffusionMatrix(x: number, y: number, terrainLattice: TerrainLattice) {
        const currentCell = terrainLattice.get(x,y);

        let totalOutboundFactor = 0, totalLeveled = 0;

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {
                if (x+dx >= 0 && y+dy >= 0 && x+dx < terrainLattice.getWidth() && y+dy < terrainLattice.getHeight()) {
                    const neighbourCell = terrainLattice.get(x+dx, y+dy);

                    // slope > 1 when neighbour cell is higher
                    const slope = (neighbourCell.altitude - currentCell.altitude) /* / cellResolution */ ; // should take cell resolution into account

                    // a function that originates at [0,0] and raises asymptotically to 1
                    // see http://fooplot.com/#W3sidHlwZSI6MCwiZXEiOiIxLTEvKHgrMSleMyIsImNvbG9yIjoiIzAwMDAwMCJ9LHsidHlwZSI6MTAwMCwid2luZG93IjpbIi0wLjUiLCIzIiwiLTQiLCI0Il19XQ--
                    //     http://fooplot.com/#W3sidHlwZSI6MCwiZXEiOiJhdGFuKDYqeCkvMS41NyIsImNvbG9yIjoiIzAwMDAwMCJ9LHsidHlwZSI6MTAwMCwid2luZG93IjpbIi0xLjgyMTExNTM4NDYxNTM4MTEiLCIxLjY3ODg4NDYxNTM4NDYxMzUiLCItMS41OTk5OTk5OTk5OTk5OTk0IiwiMS41OTk5OTk5OTk5OTk5OTk0Il19XQ--
                    // transferFactor > 1 when water comes in (inbound)
                    const transferFactor =  Math.atan(10 * slope) / (Math.PI/2) // 1-1/Math.pow(slope+1, 3);

                    if (transferFactor > 0 ) {
                        // incoming water

                        // nothing to do; diffusion factor will be set when processing source cell
                    } else if (transferFactor < 0) {
                        // outgoing water
                        totalOutboundFactor += transferFactor;
                        currentCell.diffusionMatrix[dx+1][dy+1] = transferFactor;
                    } else {
                        totalLeveled ++;
                    }

                }
            }
        }

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {

                if (currentCell.diffusionMatrix[dx+1][dy+1] > 0 || Number.isNaN(currentCell.diffusionMatrix[dx+1][dy+1]) ) {
                    // factor is not set or has been set from the source cell
                } else if (currentCell.diffusionMatrix[dx+1][dy+1] < 0) {
                    currentCell.diffusionMatrix[dx+1][dy+1] = totalOutboundFactor && currentCell.diffusionMatrix[dx+1][dy+1]/-totalOutboundFactor;
                    terrainLattice.get(x+dx,y+dy).diffusionMatrix[-dx+1][-dy+1] = -currentCell.diffusionMatrix[dx+1][dy+1];
                } else {
                    terrainLattice.get(x+dx,y+dy).diffusionMatrix[-dx+1][-dy+1] = (1 - totalOutboundFactor) / (2 * totalLeveled);
                }
            }
        }
    }
}

export class WaterflowAutomata extends FullRangeAutomata<TerrainLattice, Lattice2D<TerrainCellStatus>> {

    processCell(x: number, y:number, stateLattice: Lattice2D<TerrainCellStatus>, baseLattice: TerrainLattice) {
        // let's compute the deltas that will be added to the current cell
        let water_inner_delta = 0, water_outer_delta = 0;

        const thisTerrainCell = baseLattice.get(x,y);
        const thisTerrainStateCell = stateLattice.get(x,y);

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {
                if (x+dx >= 0 && y+dy >= 0 && x+dx < stateLattice.getWidth() && y+dy < stateLattice.getHeight()) {
                    if (dx == 0 && dy == 0) continue;

                    const fromState = stateLattice.get(x+dx, y+dy);
                    const fromBase = baseLattice.get(x+dx, y+dy);

                    // heightDiff > 0 means this cell has absolute higher water level than neighbour
                    const heightDiff = thisTerrainCell.altitude == fromBase.altitude ? 0 : thisTerrainCell.altitude + thisTerrainStateCell.water_outer - fromBase.altitude - fromState.water_outer;

                    if (thisTerrainCell.diffusionMatrix[dx+1][dy+1] < 0) {
                        // water leaving this cell
                        water_outer_delta += heightDiff >= 0 ? thisTerrainCell.diffusionMatrix[dx+1][dy+1] * thisTerrainStateCell.water_outer : -heightDiff / 16;
                    } else if (thisTerrainCell.diffusionMatrix[dx+1][dy+1] > 0) {
                        // water entering this cell --> take water level of emitting cell
                        water_outer_delta += heightDiff <= 0 ? thisTerrainCell.diffusionMatrix[dx+1][dy+1] * fromState.water_outer : -heightDiff / 16;
                    } else {

                    }
                }
            }
        }

        return {water_inner: thisTerrainStateCell.water_inner + water_inner_delta, water_outer: thisTerrainStateCell.water_outer + water_outer_delta};
    }
}


export class TerrainEnvironment extends Environment<TerrainLattice, Lattice2D<TerrainCellStatus>> {
    private extent: extent.Extent;

    constructor(image: ImageData, extent: extent.Extent) {
        super(
            TerrainLattice.createFromImages(image),
            new CellLattice2D<TerrainCellStatus>(image.width, image.height, (x,y) => ({water_inner: 0, water_outer:  Math.random()>.9 ? 50 : 0})),
            new WaterflowAutomata()
        );

        console.log(`Terrain initialized with [${this.getBase().getHeight()},${this.getBase().getWidth()}] cells`);
        this.extent = extent;
    }

    getExtent() {
        return this.extent;
    }

    renderOnCanvas() {
        const canvas: HTMLCanvasElement = document.createElement('canvas');

        const imageLattice = ImageDataLattice.fromLattice(this.getOutput(), (x, y, cell) => [0,0,255,Math.min(1, cell.water_outer/10)*255]);

        canvas.setAttribute('width', this.getOutput().getWidth()+'px');
        canvas.setAttribute('height', this.getOutput().getHeight()+'px');
        canvas.getContext('2d')!.putImageData(imageLattice.getData(), 0, 0);

        return canvas;
    }

}


export class SpatialEnvironment extends Environment<ImageDataLattice, ImageDataLattice> {
    private extent: extent.Extent;

    constructor(image: ImageData, extent: extent.Extent) {
        super(
            new ImageDataLattice(image),
            new ImageDataLattice(image), // init env with basemap as state
            //new TranslateAutomata(10)
            new AverageAutomata(1)
        );


        this.extent = extent;
    }

    getExtent() {
        return this.extent;
    }

    renderOnCanvas() {
        const canvas: HTMLCanvasElement = document.createElement('canvas');

        canvas.setAttribute('width', this.getOutput().getWidth()+'px');
        canvas.setAttribute('height', this.getOutput().getHeight()+'px');
        canvas.getContext('2d')!.putImageData(this.getOutput().getData(), 0, 0);

        return canvas;
    }

}

export class CellularAutomataSource2 extends ImageSource {

    private caEnv: TerrainEnvironment | undefined;
    private renderedImage: ImageBase;

    constructor(options: Options) {
        super(options);
    }

    setInputImages(images: ImageData[] | undefined, extent: extent.Extent) {
        if (images && images.length > 0) {
            this.caEnv = new TerrainEnvironment(images[0], extent);
        } else {
            this.caEnv = undefined;
        }
        this.renderOutput();
    }

    getEnv() {
        return this.caEnv;
    }

    getImageInternal(extent: extent.Extent, resolution: number, pixelRatio: number, projection: Projection) {
        return this.renderedImage;
    };

    renderOutput () {
        if (this.caEnv) {
            const image = this.caEnv.renderOnCanvas();
            const resolution = getHeight(this.caEnv.getExtent()) / image.height;
            this.renderedImage = new ImageCanvas(this.caEnv.getExtent(), resolution, 1, image);
        } else
            this.renderedImage = undefined as unknown as ImageBase;

        //super.handleImageChange(new Event(EventType.CHANGE));
        this.changed();
    };

    stepAutomata(n: number) {
        if (this.caEnv) {
            for (let i=0;i<n;i++)  {
                this.caEnv.applyAutomata();
                //this.handleImageChange(new Event(EventType.CHANGE));
                this.renderOutput();
            }
        }
    }
}


export class CellularAutomataSource extends ImageCanvasSource {

    private caEnv: Environment<ImageDataLattice, ImageDataLattice> | undefined;
    private extent: extent.Extent;

    constructor() {
        super({
            projection: 'EPSG:4326',
            ratio: 1,
            canvasFunction: (extent, res, pixelRatio, size, proj) => {
                const canvas: HTMLCanvasElement = document.createElement('canvas');
                canvas.setAttribute('width', size[0]+'px');
                canvas.setAttribute('height', size[1]+'px');

                const caEnv = this.getEnv();
                if (caEnv && this.extent) {
                    this.extent; // TODO make sure original extent matches requested extent
                    //extent[0] = this.extent[0];
                    //extent[1] = this.extent[1];
                    //extent[2] = this.extent[2];
                    //extent[3] = this.extent[3];

                    canvas.getContext('2d')!.putImageData(caEnv.getOutput().getData(), 0, 0);
                }
                return canvas;
            }
        });
    }

    setInputImages(images: ImageData[] | undefined, extent: extent.Extent) {
        if (images && images.length > 0) {
            this.extent = extent;
            const lattice = new ImageDataLattice(images[0]);
            this.caEnv = new Environment<ImageDataLattice, ImageDataLattice>(
                lattice,
                new ImageDataLattice(new ImageData(lattice.getWidth(), lattice.getHeight())),
                new TranslateAutomata(10) );
        } else {
            this.caEnv = undefined;
        }
    }

    getEnv() {
        return this.caEnv;
    }

}

export const MyMap = () => {
    const [viewOptions, setViewOptions] = useState<ViewOptions>();

    const mapDiv = useRef<HTMLDivElement>(null);

    useEffect( () => {
        setViewOptions( { center: [0, 0], zoom: 1 } );
    }, []);

    const caImageSource = useMemo( () => {

            //return new ImageImageData({ projection: 'EPSG:4326', imageExtent: [-180,-90,180,90] });

            return new CellularAutomataSource2({});

        } ,
        [] );


    const imageSource = useMemo( () => {
            //return new layer.Tile({source: new OSM()});
            return  new layer.Tile({source: new TileWMS({
                    crossOrigin: 'Anonymous',
                    url: 'https://geoservices.wallonie.be/arcgis/services/RELIEF/WALLONIE_MNT_2013_2014/MapServer/WMSServer',
                    params: {'LAYERS': '0', 'TILED': true}
                }) } );

        },
        [] );

    const imagesContainer = useMemo( () => {
            const container = new RenderedImagesContainer({
                sources: [imageSource]
            });
            return container;
        } ,
        [] );

    const stepAutomata = (n: number) => {
        caImageSource.stepAutomata(n);
    }

    const olmap = useMemo( () => {

            const map = new Map({
                target: mapDiv.current || undefined,
                layers: [
                    new layer.Tile({source: new OSM()}),
                    imageSource,
                    new layer.Image({
                        source: imagesContainer,
                        opacity: 0.5
                    }),
                    /*
                    new layer.Image({
                        source: new ImageStatic({
                          attributions: '© <a href="http://xkcd.com/license.html">xkcd</a>',
                          url: 'https://imgs.xkcd.com/comics/online_communities.png',
                          projection: 'EPSG:4326',
                          imageExtent: [-180,-90,180,90]
                        })
                      }),
                      */

                    new layer.Image({
                        source: caImageSource
                    })
                ],
                view: new View(viewOptions)
            });

            return map;
        },
        [mapDiv.current, viewOptions, imagesContainer] );

    useEffect( () => {
        //olmap.addControl(new ReactControl( LayerList ));
    }, [olmap])


    olmap.getLayers()//.item(0).

    return <div>
        <button onMouseUp={() => caImageSource.setInputImages(imagesContainer.getImages(), olmap.getView().calculateExtent())}>SNAPSHOT</button>>
        <button onMouseUp={() => stepAutomata(1)}>STEP</button>>
        <button onMouseUp={() => stepAutomata(50)}>STEP50</button>>
        <div style={{height: '400px'}} ref={mapDiv}/>
        <ReactControl map={olmap}>
            <LayerList map={olmap}/>
        </ReactControl>
    </div>
}

ReactDOM.render(<App />, document.getElementById('index'));
