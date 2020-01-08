import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { Map, View, ImageCanvas, ImageBase } from 'ol';
import 'ol/ol.css';
import { useState, useRef, useMemo, useEffect } from 'react';
import {
    TranslateAutomata,
    ImageDataLattice,
    Environment,
    BaseLattice2D,
    FullRangeAutomata,
    Lattice2D, Automata,
} from 'ca';
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
import {Coordinate} from "ol/coordinate";
import Polygon, {fromExtent} from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import MousePosition from "ol/control/MousePosition";
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

// array of [water_inner, water_outer]
export type TerrainCellStatus = [number, number];

export class TerrainLattice extends BaseLattice2D<TerrainCell> {
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
        const altitude = 255*(1-rgbToHsl(currentCell)[0]);

        return {
            altitude,
            diffusionMatrix: [[NaN,NaN,NaN], [NaN, NaN, NaN], [NaN, NaN, NaN]]
        }
    }

    static computeDiffusionMatrix(x: number, y: number, terrainLattice: TerrainLattice) {
        const currentCell = terrainLattice.get(x,y);

        let totalOutboundFactor = 0;

        const transferFactors = [[NaN,NaN,NaN], [NaN, NaN, NaN], [NaN, NaN, NaN]];

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {
                if (x+dx >= 0 && y+dy >= 0 && x+dx < terrainLattice.getWidth() && y+dy < terrainLattice.getHeight()) {
                    const neighbourCell = terrainLattice.get(x+dx, y+dy);

                    // slope > 1 when neighbour cell is higher
                    const slope = (neighbourCell.altitude - currentCell.altitude) /* / cellResolution */ ; // should take cell resolution into account

                    // a function that originates at [0,0] and raises asymptotically to 1
                    // see http://fooplot.com/#W3sidHlwZSI6MCwiZXEiOiIxLTEvKHgrMSleMyIsImNvbG9yIjoiIzAwMDAwMCJ9LHsidHlwZSI6MTAwMCwid2luZG93IjpbIi0wLjUiLCIzIiwiLTQiLCI0Il19XQ--
                    //     http://fooplot.com/#W3sidHlwZSI6MCwiZXEiOiJhdGFuKDYqeCkvMS41NyIsImNvbG9yIjoiIzAwMDAwMCJ9LHsidHlwZSI6MTAwMCwid2luZG93IjpbIi0xLjgyMTExNTM4NDYxNTM4MTEiLCIxLjY3ODg4NDYxNTM4NDYxMzUiLCItMS41OTk5OTk5OTk5OTk5OTk0IiwiMS41OTk5OTk5OTk5OTk5OTk0Il19XQ--
                    // transferFactor > 0 when water comes in (inbound)
                    let transferFactor =  Math.atan(10 * slope) / (Math.PI/2) // 1-1/Math.pow(slope+1, 3);

                    if (transferFactor == 0) {
                        transferFactor = -0.1; // equal altitude cells default to 0.1 transfer : major if all neighbours at same altitude, marginal if neighbours lower
                    }

                    if (transferFactor < 0) {
                        // outgoing water
                        totalOutboundFactor += transferFactor;
                    }

                    transferFactors[dy+1][dx+1] = transferFactor;
                }
            }
        }

        for (let dy=-1;dy<=1;dy++) {
            for (let dx=-1;dx<=1;dx++) {

                if (transferFactors[dy+1][dx+1] > 0 ) {
                    // factor will be set by the source cell
                } else if (transferFactors[dy+1][dx+1] < 0) {
                    // outbound water
                    // normalize outbound factors with totalOutboundFactor if totalOutboundFactor > 1
                    currentCell.diffusionMatrix[dy+1][dx+1] = transferFactors[dy+1][dx+1]/Math.max(-totalOutboundFactor, 1);
                    // set the diffusion factor of the target cell 
                    terrainLattice.get(x+dx,y+dy).diffusionMatrix[-dy+1][-dx+1] = -currentCell.diffusionMatrix[dy+1][dx+1];
                } else {
                    // neighbour out of lattice
                }
            }
        }
    }
}

export class WaterflowAutomata extends FullRangeAutomata<Lattice2D<TerrainCellStatus>, TerrainLattice> {

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
                    const heightDiff = thisTerrainCell.altitude == fromBase.altitude ? 
                        0 : 
                        thisTerrainCell.altitude + thisTerrainStateCell[1] - fromBase.altitude - fromState[1];

                    if (thisTerrainCell.diffusionMatrix[dy+1][dx+1] < 0) {
                        // water leaving this cell
                        water_outer_delta += heightDiff >= -5 ? thisTerrainCell.diffusionMatrix[dy+1][dx+1] * thisTerrainStateCell[1] : -heightDiff / 16;
                    } else if (thisTerrainCell.diffusionMatrix[dy+1][dx+1] > 0) {
                        // water entering this cell --> take water level of emitting cell
                        water_outer_delta += heightDiff <= 5 ? thisTerrainCell.diffusionMatrix[dy+1][dx+1] * fromState[1] : -heightDiff / 16;
                    } else {

                    }
                }
            }
        }

        return [thisTerrainStateCell[0] + water_inner_delta, thisTerrainStateCell[1] + water_outer_delta];
    }
}


export class SpatialEnvironment<STATELATTICE extends Lattice2D, BASELATTICE extends Lattice2D | never> extends Environment<STATELATTICE, BASELATTICE> {
    private extent: extent.Extent;
    private cellSpatialWidth: number;
    private cellSpatialHeight: number;
    private imageDataFn: (state: STATELATTICE, base: BASELATTICE) => ImageData;

    constructor(state: STATELATTICE,
                base: BASELATTICE,
                automata: Automata<STATELATTICE, BASELATTICE>,
                extent: extent.Extent,
                imageDataFn: (state: STATELATTICE, base: BASELATTICE) => ImageData) {
        super(
            state,
            base,
            automata
        );
        this.imageDataFn = imageDataFn;
        this.extent = extent;
        this.cellSpatialWidth = (extent[2] - extent[0]) / state.getWidth();
        this.cellSpatialHeight = (extent[3] - extent[1]) / state.getHeight();
    }

    getExtent() {
        return this.extent;
    }

    renderOnCanvas() {
        const canvas: HTMLCanvasElement = document.createElement('canvas');

        canvas.setAttribute('width', this.getState().getWidth()+'px');
        canvas.setAttribute('height', this.getState().getHeight()+'px');
        canvas.getContext('2d')!.putImageData(this.imageDataFn(this.getState(), this.getBase()), 0, 0);

        return canvas;
    }

    getCellAt(coords: Coordinate) {
        const cellX = Math.floor( (this.getBase().getWidth())*(coords[0]-this.getExtent()[0])/(this.getExtent()[2]-this.getExtent()[0]) );
        const cellY = Math.floor( (this.getBase().getHeight())*(-coords[1]+this.getExtent()[3])/(this.getExtent()[3]-this.getExtent()[1]) );
        const cellExtent = [
            this.getExtent()[0]+ (cellX)*this.cellSpatialWidth,
            this.getExtent()[3]- (cellY)*this.cellSpatialHeight,
            this.getExtent()[0]+ (cellX+1)*this.cellSpatialWidth,
            this.getExtent()[3]- (cellY+1)*this.cellSpatialHeight];
        return {
            xy: [cellX, cellY],
            geom: fromExtent(cellExtent),
            cell: this.getStateAndBase(cellX, cellY)
        };
    }

}

export class TerrainEnvironment extends SpatialEnvironment<Lattice2D<TerrainCellStatus>, TerrainLattice> {

    constructor(image: ImageData, extent: extent.Extent) {
        super(
            new BaseLattice2D<TerrainCellStatus>(image.width, image.height, (x, y) => ([0, Math.random()>.9 ? 50 : 0])),
            TerrainLattice.createFromImages(image),
            new WaterflowAutomata(),
            extent,
            (state, base) => {
                return ImageDataLattice.fromLattice(state, (x, y, cell) => [0,0,255,Math.min(1, cell[1]/10)*255]).getData();
            }
        );

        console.log(`Terrain initialized with [${this.getBase().getHeight()},${this.getBase().getWidth()}] cells`);
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

                    canvas.getContext('2d')!.putImageData(caEnv.getState().getData(), 0, 0);
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
    const [selectedCell, setSelectedCell] = useState<{geom: Polygon, cell: [TerrainCellStatus, TerrainCell]}>();

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

    const selectedFeatures = useMemo( () => {
            return new VectorSource();
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
                controls: [new MousePosition()],
                target: mapDiv.current || undefined,
                layers: [
                    new layer.Tile({source: new OSM()}),
                    imageSource,
                    new layer.Image({
                        source: imagesContainer,
                        opacity: 0.5
                    }),
                    new layer.Image({
                        source: caImageSource
                    }),
                    new layer.Vector({
                        source: selectedFeatures
                    })
                ],
                view: new View(viewOptions)
            });

            map.on('singleclick', function (evt) {
                map.forEachLayerAtPixel(evt.pixel, function(layer) {
                    const targetSource = layer.getSource();
                    if (caImageSource == targetSource) {
                        const xy1 = evt.coordinate;
                        const cellFeature = caImageSource.getEnv()?.getCellAt(xy1);
                        setSelectedCell(cellFeature);
                    }
                });
            });

            return map;
        },
        [mapDiv.current, viewOptions, imagesContainer] );

    useEffect( () => {
        selectedFeatures.clear();
        selectedFeatures.addFeature(new Feature(selectedCell?.geom));
        selectedFeatures.changed();
    }, [selectedFeatures, selectedCell?.geom])


    olmap.getLayers()//.item(0).

    return <div>
        <button onMouseUp={() => caImageSource.setInputImages(imagesContainer.getImages(), olmap.getView().calculateExtent())}>SNAPSHOT</button>>
        <button onMouseUp={() => stepAutomata(1)}>STEP</button>>
        <button onMouseUp={() => stepAutomata(50)}>STEP50</button>>

        <div style={{display: "flex"}}>
            <div style={{flex: 2}}>
                <div style={{height: '400px'}} ref={mapDiv}/>
                <ReactControl map={olmap}>
                    <LayerList map={olmap}/>
                </ReactControl>
            </div>
            <div style={{flex: 1}}>
                {selectedCell && (
                    <>
                    <table>
                        <tr><td>Alt</td><td>{selectedCell.cell[1].altitude}</td></tr>
                        <tr><td>Water</td><td>{selectedCell.cell[0][1]}</td></tr>
                    </table>
                    <DiffusionMatrix matrix={selectedCell.cell[1].diffusionMatrix}/>
                    </>
                )}
            </div>
        </div>

    </div>
}

const DiffusionMatrix = (props: {matrix: number[][]}) => {
    const {matrix} = props;
    return <table>
        {matrix.map(row => <tr>{row.map(cell => <td>{cell.toFixed(2)}</td>)}</tr>)}
    </table>
}

ReactDOM.render(<App />, document.getElementById('index'));
