export class Cell {

}

export type Automata<I , O> = {
   step: (inputs: I, outputs: O) => void; 
}

export class TranslateAutomata implements Automata<Lattice2D, Lattice2D> {
    step(lattice: Lattice2D, outputLattice: Lattice2D) {

        for (let y=0;y<lattice.getHeight();y++) {
            for (let x=0;x<lattice.getWidth();x++) {
                const outputCell = x >= 50 ? lattice.get(x-50, y) : lattice.get(0, y);
                outputLattice.set(x,y,outputCell);
            }
        }

        console.log('CA done');
    }
    
} 

export class Environment<INLATTICE, OUTLATTICE> {

    private input: INLATTICE;

    private output: OUTLATTICE;

    private automata: Automata<INLATTICE , OUTLATTICE>;

    constructor(input: INLATTICE, output: OUTLATTICE, automata: Automata<INLATTICE , OUTLATTICE>) {
        this.input = input;
        this.output = output;
        this.automata = automata;
    }

    applyAutomata() {
        this.automata.step(this.input, this.output);
    }

    getOutput() {
        return this.output;
    }
}

export interface Lattice2D<C = any> {
    get(x: number, y: number): C;

    set(x: number, y: number, value: C): void;

    getWidth(): number;

    getHeight(): number;
}

export class CellLattice2D implements Lattice2D<Cell> {
    getWidth(): number {
        return this.cells[0].length;
    }
    getHeight(): number {
        return this.cells.length;
    }

    private cells: Cell[][];

    Lattice2D(width: number, height: number) {
        this.cells = new Cell[width][height]
    }

    get(x: number, y: number): Cell {
        return this.cells[y][x];
    }

    set(x: number, y: number, value: Cell) {
        this.cells[y][x] = value;
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
    
}
