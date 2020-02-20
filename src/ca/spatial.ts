import {Lattice2D, Environment, Automata, ImageDataLattice, BaseLattice2D, LATTICETYPE} from "./model";
import {Coordinate} from "ol/coordinate";
import {fromExtent} from "ol/geom/Polygon";
import { Extent, getHeight } from "ol/extent";
import { rgbToHsl } from "color-utils";
import { ImageBase, ImageCanvas } from "ol";
import ImageSource, { Options } from "ol/source/Image";
import Projection from "ol/proj/Projection";
import {Size} from "ol/size";

export type AutomataDescriptor<STATECELL = any, BASECELL = never> = {
    init: (images: ImageData[], size: Size) => [Lattice2D<STATECELL>, LATTICETYPE<BASECELL>],

    stepFn: (currentState: Lattice2D<STATECELL>, base: LATTICETYPE<BASECELL>) => Lattice2D<STATECELL>,

    renderFn: (state: Lattice2D<STATECELL>, base: LATTICETYPE<BASECELL>) => ImageData
}

export type ProjectDescriptor<STATECELL = any, BASECELL = never> = AutomataDescriptor<STATECELL, BASECELL> & {
    layers: string[],
    extent: [number, number, number, number]
}

export class SpatialEnvironment<STATELATTICE extends Lattice2D, BASELATTICE extends Lattice2D | never> extends Environment<STATELATTICE, BASELATTICE> {
    private extent: Extent;
    private cellSpatialWidth: number;
    private cellSpatialHeight: number;
    private imageDataFn: (state: STATELATTICE, base: BASELATTICE) => ImageData;

    constructor(state: STATELATTICE,
                base: BASELATTICE,
                automata: Automata<STATELATTICE, BASELATTICE>,
                extent: Extent,
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

    getCellAtPixel(cellXY: [number, number]) {
        const [cellX, cellY] = cellXY;

        const cellExtent = [
            this.getExtent()[0]+ (cellX)*this.cellSpatialWidth,
            this.getExtent()[3]- (cellY)*this.cellSpatialHeight,
            this.getExtent()[0]+ (cellX+1)*this.cellSpatialWidth,
            this.getExtent()[3]- (cellY+1)*this.cellSpatialHeight];
        return {
            xy: [cellX, cellY] as [number, number],
            geom: fromExtent(cellExtent),
            cell: this.getStateAndBase(cellX, cellY)
        };
    }

    getCellAtSpatial(coords: Coordinate) {
        const cellX = Math.floor( (this.getBase().getWidth())*(coords[0]-this.getExtent()[0])/(this.getExtent()[2]-this.getExtent()[0]) );
        const cellY = Math.floor( (this.getBase().getHeight())*(-coords[1]+this.getExtent()[3])/(this.getExtent()[3]-this.getExtent()[1]) );
        return this.getCellAtPixel([cellX, cellY]);
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

// array of [water_inner, water_outer, globalXYDirection]
export type TerrainCellStatus = [number, number, [number,number], number[][]?];

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

        return {
            altitude : 1000*(1-rgbToHsl(currentCell)[0]),
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

export class CellularAutomataSource2 extends ImageSource {

    private envConstructor: (images: ImageData[] | undefined, size: Size, extent: Extent) => SpatialEnvironment<Lattice2D, Lattice2D>;
    private caEnv: SpatialEnvironment<Lattice2D, Lattice2D> | undefined;
    private renderedImage: ImageBase;
    private _renderingTime: number;

    constructor(options: Options, envConstructor: (images: ImageData[], size: Size, extent: Extent) => SpatialEnvironment<Lattice2D, Lattice2D>) {
        super(options);
        this.envConstructor = envConstructor;
    }

    get renderingTime(): number {
        return this._renderingTime;
    }

    setInputImages(images: ImageData[] | undefined, size: Size | undefined, extent: Extent) {
        if (size && images && images.length > 0) {
            this.caEnv = this.envConstructor(images, size, extent);
        } else {
            this.caEnv = undefined;
        }
        this.renderOutput();
    }

    getEnv() {
        return this.caEnv;
    }

    getImageInternal(extent: Extent, resolution: number, pixelRatio: number, projection: Projection) {
        return this.renderedImage;
    };

    renderOutput () {
        const start = new Date().getTime();
        if (this.caEnv) {
            const image = this.caEnv.renderOnCanvas();
            const resolution = getHeight(this.caEnv.getExtent()) / image.height;
            this.renderedImage = new ImageCanvas(this.caEnv.getExtent(), resolution, 1, image);
        } else
            this.renderedImage = undefined as unknown as ImageBase;

        this._renderingTime = new Date().getTime() - start;

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


export function createEnvironment<STATE_CELLTYPE, BASE_CELLTYPE>(
    extent: Extent,
    stateLattice: Lattice2D<STATE_CELLTYPE>,
    baseLattice: Lattice2D<BASE_CELLTYPE>,
    step: (currentState: Lattice2D<STATE_CELLTYPE>, baseLattice: Lattice2D<BASE_CELLTYPE>) => Lattice2D<STATE_CELLTYPE>,
    renderFn: (state: Lattice2D<STATE_CELLTYPE>, base: Lattice2D<BASE_CELLTYPE>) => ImageData
) {

    return new SpatialEnvironment(
        stateLattice,
        baseLattice,
        {step},
        extent,
        renderFn
    );
}