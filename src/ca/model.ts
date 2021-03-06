

export type Automata<STATELATTICE extends Lattice2D<STATECELL>, BASELATTICE extends Lattice2D<BASECELL> | void, STATECELL = any, BASECELL = any> = {
   step: (currentState: STATELATTICE, baseLattice: BASELATTICE) => STATELATTICE;
}


export abstract class CellByCellAutomata<STATELATTICE extends Lattice2D, BASELATTICE extends Lattice2D | void>
    implements Automata<STATELATTICE, BASELATTICE> {

    step(stateLattice: STATELATTICE, baseLattice: BASELATTICE) {
        return mapInto(
            stateLattice,
            stateLattice.newInstance() as STATELATTICE,
            (x,y,stateLattice) => this.processCell(x,y,stateLattice, baseLattice)
        );
    }

    abstract processCell(x: number, y:number, stateLattice: STATELATTICE, baseLattice?: BASELATTICE) : CELLTYPE<STATELATTICE>;
    
}

export class TranslateAutomata<STATELATTICE extends Lattice2D, BASELATTICE extends Lattice2D | void> extends CellByCellAutomata<STATELATTICE, BASELATTICE> {
    private offset: number;

    constructor(offset: number) {
        super();
        this.offset = offset;
    }

    processCell(x: number, y:number, stateLattice: STATELATTICE) {
        return x >= this.offset ? stateLattice.get(x-this.offset, y) : stateLattice.get(0, y);
    }
    
} 

export class AverageAutomata extends CellByCellAutomata<Lattice2D<Pixel>, Lattice2D<Pixel>> {
    private range: number;

    constructor(range: number) {
        super();
        this.range = range;
    }

    processCell(x: number, y:number, stateLattice: Lattice2D<Pixel>) {
        const newCell = [0,0,0,0] as Pixel;

        for (let dy=-this.range;dy<=this.range;dy++) {
            for (let dx=-this.range;dx<=this.range;dx++) {
                if (x+dx >= 0 && y+dy >= 0 && x+dx < stateLattice.getWidth() && y+dy < stateLattice.getHeight()) {
                    const pixel = stateLattice.get(x+dx, y+dy);
                    [0,1,2,3].forEach( (idx) => newCell[idx] += pixel[idx]);
                }
            }
        }
        const cellNb = Math.pow(1+2*this.range,2);

        [0,1,2,3].forEach( (idx) => newCell[idx] = newCell[idx]/cellNb);

        return newCell;
    }
}

export type LATTICETYPE<C> = [C] extends [never] ? never : Lattice2D<C>;

// Conditional type to infer cell type from lattice type
export type CELLTYPE<L> = L extends Lattice2D<infer STATECELL> ? STATECELL : never;

export class Environment<STATELATTICE extends Lattice2D, BASELATTICE extends Lattice2D | never > {

    private _lastIterationTime: number;
    private _totalSteps = 0;

    private base: BASELATTICE;

    private state: STATELATTICE;

    private automata: Automata<STATELATTICE, BASELATTICE>;

    constructor(state: STATELATTICE, base: BASELATTICE, automata: Automata<STATELATTICE, BASELATTICE>) {
        this.base = base;
        this.state = state;
        this.automata = automata;
    }

    applyAutomata() {
        const start = new Date().getTime();
        this.state = this.automata.step(this.state, this.base);
        this._lastIterationTime = new Date().getTime() - start;
        this._totalSteps ++;
    }

    getState() {
        return this.state;
    }

    getBase() {
        return this.base;
    }

    getStateAndBase(x: number, y: number): [CELLTYPE<STATELATTICE>, CELLTYPE<BASELATTICE>] {
        return [this.state.get(x, y), this.base ? this.base.get(x, y) : undefined];
    }

    get lastIterationTime(): number {
        return this._lastIterationTime;
    }

    get totalSteps(): number {
        return this._totalSteps;
    }
}

export interface Lattice2D<C = any> {
    get(x: number, y: number): C;

    set(x: number, y: number, value: C): void;

    getWidth(): number;

    getHeight(): number;

    //newState(): Lattice2D<C>;

    newInstance(width?: number, height?: number): Lattice2D<C>;

    forEach(forEachFn: (cell: C, x: number, y: number, _this: Lattice2D<C>) => void): void;
}

export function mapInto<SOURCE extends Lattice2D, TARGET extends Lattice2D>
    (source: SOURCE,
     targetLattice: TARGET,
     mapFn:  (x: number, y:number, source: SOURCE) => CELLTYPE<TARGET> ): TARGET {
    
    for (let y=0;y<targetLattice.getHeight();y++) {
        for (let x=0;x<targetLattice.getWidth();x++) {

            targetLattice.set(x,y, mapFn(x, y, source));
        }
    }

    return targetLattice;
 }

export class BaseLattice2D<CELLTYPE> implements Lattice2D<CELLTYPE> {
    getWidth(): number {
        return this.cells[0].length;
    }
    getHeight(): number {
        return this.cells.length;
    }

    private cells: CELLTYPE[][];

    constructor(width: number, height: number, initCellFn?: (x: number, y: number) => CELLTYPE) {
        this.cells = new Array(height).fill(undefined);
        this.cells.forEach( (value, idx, arr) => arr[idx] = new Array(width) );

        if (initCellFn) {
            this.forEach( (cell, x, y, _this) => { _this.set(x, y, initCellFn(x, y)) } );
        }
    }

    get(x: number, y: number): CELLTYPE {
        return this.cells[y][x];
    }

    set(x: number, y: number, value: CELLTYPE) {
        this.cells[y][x] = value;
    }

    newInstance(width?: number, height?: number, initCellFn?: (x: number, y: number) => CELLTYPE) {
        const newLattice = new BaseLattice2D<CELLTYPE>(width == undefined ? this.getWidth(): width, height == undefined ? this.getHeight() : height);

        return newLattice;
    }

    forEach(forEachFn: (cell: CELLTYPE, x: number, y: number, _this: Lattice2D<CELLTYPE>) => void) {
        for (let y = 0; y < this.getHeight(); y++) {
            for (let x = 0; x < this.getWidth(); x++) {
                forEachFn(this.get(x, y), x, y, this);
            }
        }
    }
}

export type Pixel = [number, number, number, number];
// TODO make ImageDataLattice be a subclass of BaseLattice2D
export class ImageDataLattice implements Lattice2D<Pixel> {

    getWidth(): number {
        return this.data.width
    }
    getHeight(): number {
        return this.data.height
    }

    private data:ImageData;

    constructor(data: ImageData) {
        this.data = data;
    }

    get(x: number, y: number): Pixel {
        const pos = this.getPixelPos(x,y);
        const slice = this.data.data.slice(pos, pos+4);
        return slice as unknown as Pixel;
    }

    set(x: number, y: number, value: Pixel) {
        const pos = this.getPixelPos(x,y);
        this.data.data.set(value, pos);
    }

    getPixelPos(x: number, y: number) {
        return (x + y * this.data.width) * 4;
    }

    getData() {
        return this.data;
    }

    newInstance(width?: number, height?: number) {
        return new ImageDataLattice(
            new ImageData(
                width == undefined ? this.getWidth(): width,
                height == undefined ? this.getHeight() : height));
    }

    forEach(forEachFn: (cell: Pixel, x: number, y: number, _this: ImageDataLattice) => void) {
        for (let y=0;y<this.getHeight();y++) {
            for (let x=0;x<this.getWidth();x++) {
                forEachFn(this.get(x, y), x, y, this);
            }
        }  
    }

    static fromLattice<SOURCECELLTYPE>(sourceLattice: Lattice2D<SOURCECELLTYPE>, mapFn: (x: number, y: number, cell: SOURCECELLTYPE) => Pixel) {
        const newImageLattice = new ImageDataLattice(new ImageData(sourceLattice.getWidth(), sourceLattice.getHeight()));

        newImageLattice.forEach( (cell, x, y, _this) => _this.set(x, y, mapFn(x, y, sourceLattice.get(x, y))) );

        return newImageLattice;
    }
    
}

export function iterateNeighbourhood<SL extends Lattice2D, BL extends Lattice2D | never>(
    state:SL,
    base:BL,
    x: number,
    y:number,
    distance: number,
    fn: (dx: number, dy: number, stateAndBase: [CELLTYPE<SL>, CELLTYPE<BL>]) => void) {
    for (let dy=-distance;dy<=distance;dy++) {
        for (let dx = -distance; dx <= distance; dx++) {
            if (x+dx >= 0 && y+dy >= 0 && x+dx < state.getWidth() && y+dy < state.getHeight()) {
                fn(dx, dy, [state.get(x+dx, y+dy), base?.get(x+dx, y+dy)] );
            }
        }
    }
}

export function rms(arr: number[]) {

    let squaresSum = arr
        .map((val) => (val*val))
        .reduce((acum, sq) => (acum + sq));

    return Math.sqrt(squaresSum/arr.length);
}

export function rssq(arr: number[]) {

    let squaresSum = arr
        .map((val) => (val*val))
        .reduce((acum, sq) => (acum + sq));

    return Math.sqrt(squaresSum);
}


