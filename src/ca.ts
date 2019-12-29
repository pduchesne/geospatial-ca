export class Cell {

}

export type Automata<I extends Lattice2D, O extends Lattice2D> = {
   step: (baseLattice: I, currentState: O) => O; 
}


export abstract class FullRangeAutomata<I extends Lattice2D, O extends Lattice2D> implements Automata<I, O> {

    step(baseLattice: I, stateLattice: O) {

        const newState = stateLattice.cloneEmpty() as O;
        for (let y=0;y<newState.getHeight();y++) {
            for (let x=0;x<newState.getWidth();x++) {
                
                newState.set(x,y, this.processCell(x, y, stateLattice));
            }
        }

        return newState;
    }

    abstract processCell(x: number, y:number, stateLattice: O) : any;
    
} 

export class TranslateAutomata<I extends Lattice2D, O extends Lattice2D> extends FullRangeAutomata<I, O> {
    private offset: number;

    constructor(offset: number) {
        super();
        this.offset = offset;
    }

    processCell(x: number, y:number, stateLattice: O) {
        return x >= this.offset ? stateLattice.get(x-this.offset, y) : stateLattice.get(0, y);
    }
    
} 

export class AverageAutomata<I extends Lattice2D<Pixel>, O extends Lattice2D<Pixel>> extends FullRangeAutomata<I, O> {
    private range: number;

    constructor(range: number) {
        super();
        this.range = range;
    }

    processCell(x: number, y:number, stateLattice: O) {
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

export class Environment<BASELATTICE extends Lattice2D, STATELATTICE extends Lattice2D> {

    private base: BASELATTICE;

    private currentState: STATELATTICE;

    private automata: Automata<BASELATTICE , STATELATTICE>;

    constructor(input: BASELATTICE, output: STATELATTICE, automata: Automata<BASELATTICE , STATELATTICE>) {
        this.base = input;
        this.currentState = output;
        this.automata = automata;
    }

    applyAutomata() {
        this.currentState = this.automata.step(this.base, this.currentState);
    }

    getOutput() {
        return this.currentState;
    }
}

export interface Lattice2D<C = any> {
    get(x: number, y: number): C;

    set(x: number, y: number, value: C): void;

    getWidth(): number;

    getHeight(): number;

    cloneEmpty(): Lattice2D<C>;
}

export class CellLattice2D implements Lattice2D<Cell> {
    getWidth(): number {
        return this.cells[0].length;
    }
    getHeight(): number {
        return this.cells.length;
    }

    private cells: Cell[][];

    constructor(width: number, height: number) {
        this.cells = new Cell[width][height]
    }

    get(x: number, y: number): Cell {
        return this.cells[y][x];
    }

    set(x: number, y: number, value: Cell) {
        this.cells[y][x] = value;
    }

    cloneEmpty() {
        return new CellLattice2D(this.getWidth(), this.getHeight());
    }
}

export type Pixel = [number, number, number, number];
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

    cloneEmpty() {
        return new ImageDataLattice(new ImageData(this.getWidth(), this.getHeight()));
    }
    
}
